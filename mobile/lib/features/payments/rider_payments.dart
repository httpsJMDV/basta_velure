import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_failure.dart';
import '../../core/api/json.dart';
import '../../core/media/photo_picker.dart';
import '../../core/format.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/widgets.dart';
import '../rider/rider_paths.dart';

const _statusLabels = {
  'pending': 'Awaiting hub or courier',
  'processing': 'Sent — check your GCash',
  'completed': 'Received',
  'rejected': 'Declined',
};

class RiderPaymentQueueScreen extends StatelessWidget {
  const RiderPaymentQueueScreen({super.key, required this.role});
  final String role;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Rider payment requests')),
    body: SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: RiderPaymentPanel(role: role),
    ),
  );
}

/// Shared request ledger for the rider, home hub and courier. All amounts come from reserved server earnings.
class RiderPaymentPanel extends ConsumerStatefulWidget {
  const RiderPaymentPanel({super.key, this.role = 'rider'});
  final String role;
  @override
  ConsumerState<RiderPaymentPanel> createState() => _RiderPaymentPanelState();
}

class _RiderPaymentPanelState extends ConsumerState<RiderPaymentPanel> {
  List<Json>? _rows;
  Json _summary = {};
  int _page = 1;
  int _lastPage = 1;
  String _status = 'open';
  bool _busy = false;
  String? _error;
  Timer? _timer;
  int _version = 0;
  bool get _rider => widget.role == 'rider';
  String get _base => _rider
      ? '/rider/payment-requests'
      : '/${widget.role}/rider-payment-requests';
  Dio get _dio => ref.read(dioProvider);

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!_busy) _load();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final version = ++_version;
    try {
      final result = asJson(
        (await _dio.get<Object?>(
          _base,
          queryParameters: {'page': _page, if (!_rider) 'status': _status},
        )).data,
      );
      if (!mounted || version != _version) return;
      setState(() {
        _rows = asJsonList(result['data']);
        _summary = asJson(result['summary']);
        _lastPage = asInt(asJson(result['meta'])['last_page'], 1);
        _error = null;
      });
    } catch (error) {
      if (mounted && version == _version) {
        setState(() => _error = ApiFailure.from(error).message);
      }
    }
  }

  Future<void> _act(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      await _load();
    } catch (error) {
      if (mounted) setState(() => _error = ApiFailure.from(error).message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _request() async {
    final snapshot = Map<String, dynamic>.from(_summary);
    final ok = await confirmAction(
      context,
      title: 'Request your earned payment?',
      message:
          '${formatPeso(asDouble(snapshot['available']))} will be requested from your hub or courier, payable to ${snapshot['gcash_name']} (${snapshot['gcash_number']}). This reserves your currently available earnings. New earnings stay separate.',
      confirmLabel: 'Request payment',
    );
    if (ok) {
      await _act(() async {
        await _dio.post<Object?>(
          _base,
          data: {
            'confirmed': true,
            'expected_amount': snapshot['available'],
            'expected_gcash_number': snapshot['gcash_number'],
            'expected_gcash_name': snapshot['gcash_name'],
          },
        );
        _page = 1;
      });
    }
  }

  Future<void> _confirm(Json row) async {
    final ok = await confirmAction(
      context,
      title: 'Did the payment arrive?',
      message:
          'Only confirm after ${formatPeso(asDouble(row['amount']))} is in your GCash. Reference: ${row['transfer_reference']}.',
      confirmLabel: 'Yes, I received it',
    );
    if (ok) {
      await _act(() async {
        await _dio.post<Object?>(
          '$_base/${row['id']}/confirm',
          data: {'confirmed': true},
        );
      });
    }
  }

  Future<void> _note(Json row, bool reject) async {
    final note = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _PaymentNoteSheet(
        title: reject ? 'Decline this request' : 'Report a missing payment',
      ),
    );
    if (note == null) return;
    await _act(() async {
      await _dio.post<Object?>(
        '$_base/${row['id']}/${reject ? 'reject' : 'report'}',
        data: {'note': note},
      );
    });
  }

  Future<void> _send(Json row) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final response = asJson(
        (await _dio.post<Object?>('$_base/${row['id']}/claim')).data,
      );
      await _load();
      if (!mounted) return;
      await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => _PaymentTransferSheet(
          row: asJson(response['data']),
          dio: _dio,
          base: _base,
        ),
      );
      await _load();
    } catch (error) {
      if (mounted) setState(() => _error = ApiFailure.from(error).message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _release(Json row) async {
    final ok = await confirmAction(
      context,
      title: 'Release this assignment?',
      message: 'Only release if you have not sent any money. Another staff member can then take the request.',
      confirmLabel: 'I have not sent funds',
    );
    if (ok) {
      await _act(() async {
        await _dio.post<Object?>(
          '$_base/${row['id']}/release',
          data: {'not_sent': true},
        );
      });
    }
  }

  Future<void> _receipt(Json row) async {
    try {
      final response = await _dio.get<List<int>>(
        '/rider-payments/${row['id']}/receipt',
        options: Options(responseType: ResponseType.bytes),
      );
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (_) => Dialog(
          child: InteractiveViewer(
            child: Image.memory(Uint8List.fromList(response.data!)),
          ),
        ),
      );
    } catch (error) {
      if (mounted) setState(() => _error = ApiFailure.from(error).message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
        side: const BorderSide(color: AppColors.stone200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.account_balance_wallet_outlined,
                  color: AppColors.brandRed,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    _rider ? 'Your payment requests' : 'Rider payment requests',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Refresh payment requests',
                  onPressed: _busy ? null : _load,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            Text(
              _rider
                  ? 'Request earned pickup, delivery and completed-trip pay. Your hub or courier sends it to your GCash.'
                  : 'One shared queue for hub and courier. Check the account and send the exact requested amount before recording a transfer.',
              style: const TextStyle(
                fontSize: 12,
                height: 1.5,
                color: AppColors.stone600,
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Colors.red),
                  semanticsLabel: 'Payment error: $_error',
                ),
              ),
            if (_rows == null && _error == null)
              const Padding(
                padding: EdgeInsets.all(12),
                child: LinearProgressIndicator(),
              ),
            if (_rider && _rows != null) ...[
              const SizedBox(height: 16),
              const Text(
                'Available to request',
                style: TextStyle(fontSize: 12, color: AppColors.stone600),
              ),
              Text(
                formatPeso(asDouble(_summary['available'])),
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(
                '${_summary['gcash_name'] ?? 'No GCash account saved'} ${_summary['gcash_number'] ?? ''}',
                style: const TextStyle(fontSize: 12),
              ),
              const SizedBox(height: 10),
              FilledButton.icon(
                onPressed: !_busy && asBool(_summary['can_request'])
                    ? _request
                    : null,
                icon: const Icon(Icons.payments_outlined),
                label: Text(_busy ? 'Please wait…' : 'Request payment'),
              ),
              if (asBool(_summary['has_open_request']))
                const Text(
                  'Your current request must be paid and confirmed, or declined, before you can request again.',
                  style: TextStyle(fontSize: 12, height: 1.5),
                ),
              TextButton(
                onPressed: () => context.push(RiderPaths.gcash),
                child: const Text('Manage your GCash account'),
              ),
            ],
            if (!_rider)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: DropdownButtonFormField<String>(
                  isExpanded: true,
                  initialValue: _status,
                  decoration: const InputDecoration(
                    labelText: 'Request status',
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: 'open',
                      child: Text('Open requests'),
                    ),
                    DropdownMenuItem(
                      value: 'pending',
                      child: Text('Awaiting payment'),
                    ),
                    DropdownMenuItem(
                      value: 'processing',
                      child: Text('Sent / awaiting confirmation'),
                    ),
                    DropdownMenuItem(
                      value: 'completed',
                      child: Text('Received'),
                    ),
                    DropdownMenuItem(
                      value: 'rejected',
                      child: Text('Declined'),
                    ),
                    DropdownMenuItem(value: 'all', child: Text('All requests')),
                  ],
                  onChanged: _busy
                      ? null
                      : (value) {
                          setState(() {
                            _status = value!;
                            _page = 1;
                            _rows = null;
                          });
                          _load();
                        },
                ),
              ),
            if (_rows?.isEmpty == true)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Text(
                  'No payment requests here yet.',
                  style: TextStyle(color: AppColors.stone600),
                ),
              ),
            for (final row in _rows ?? <Json>[])
              Container(
                margin: const EdgeInsets.only(top: 12),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.stone50,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${row['reference_code']}',
                      style: const TextStyle(
                        fontSize: 11,
                        fontFamily: 'monospace',
                        color: AppColors.stone600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      formatPeso(asDouble(row['amount'])),
                      style: const TextStyle(
                        fontSize: 21,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      'Requested ${Fmt.dateTime(asDate(row['created_at']))}',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.stone600,
                      ),
                    ),
                    Text(
                      _statusLabels[asString(row['status'])] ??
                          '${row['status']}',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: row['status'] == 'completed'
                            ? Colors.green.shade800
                            : AppColors.brandRed,
                      ),
                    ),
                    if (!_rider)
                      Text(
                        '${row['rider_name']} · ${row['hub_name']}',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    Text(
                      '${row['gcash_name']} · ${row['gcash_number']}',
                      style: const TextStyle(fontSize: 12),
                    ),
                    Text(
                      '${asInt(asJson(row['breakdown'])['earnings_count'])} pickup/delivery earnings · ${asInt(asJson(row['breakdown'])['trips_count'])} completed trips',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.stone600,
                      ),
                    ),
                    if (row['transfer_reference'] != null)
                      SelectableText(
                        'GCash ${row['transfer_reference']}',
                        style: const TextStyle(fontSize: 12),
                      ),
                    if (row['assigned_to'] != null)
                      Text(
                        'Assigned to ${row['processor_name']}. Other staff must not send this payment.',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.brandRed,
                        ),
                      ),
                    if (row['note'] != null)
                      Text(
                        'Decision: ${row['note']}',
                        style: const TextStyle(fontSize: 12),
                      ),
                    if (row['report_note'] != null)
                      Text(
                        'Reported issue: ${row['report_note']}. ${row['status'] == 'completed' ? 'The rider has since confirmed receipt.' : 'Check the actual transfer with the rider. This request remains open until receipt is confirmed.'}',
                        style: const TextStyle(fontSize: 12, color: Colors.red),
                      ),
                    Wrap(
                      spacing: 8,
                      children: [
                        if (asBool(row['has_receipt']))
                          TextButton.icon(
                            onPressed: () => _receipt(row),
                            icon: const Icon(
                              Icons.receipt_long_outlined,
                              size: 16,
                            ),
                            label: const Text('View receipt'),
                          ),
                        if (!_rider &&
                            row['status'] == 'pending' &&
                            asBool(row['can_process'])) ...[
                          FilledButton(
                            onPressed: _busy ? null : () => _send(row),
                            child: Text(
                              row['assigned_to'] == null
                                  ? 'Take request'
                                  : 'Record transfer',
                            ),
                          ),
                          if (row['assigned_to'] != null)
                            TextButton(
                              onPressed: _busy ? null : () => _release(row),
                              child: const Text('Release assignment'),
                            ),
                          TextButton(
                            onPressed: _busy ? null : () => _note(row, true),
                            child: const Text('Decline'),
                          ),
                        ],
                        if (_rider && row['status'] == 'processing') ...[
                          FilledButton(
                            onPressed: _busy ? null : () => _confirm(row),
                            child: const Text('I received it'),
                          ),
                          if (row['report_note'] == null)
                            TextButton(
                              onPressed: _busy ? null : () => _note(row, false),
                              child: const Text('Payment not received'),
                            ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            if (_lastPage > 1)
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    tooltip: 'Previous page',
                    onPressed: _page > 1 && !_busy
                        ? () {
                            setState(() => _page--);
                            _load();
                          }
                        : null,
                    icon: const Icon(Icons.chevron_left),
                  ),
                  Text('$_page / $_lastPage'),
                  IconButton(
                    tooltip: 'Next page',
                    onPressed: _page < _lastPage && !_busy
                        ? () {
                            setState(() => _page++);
                            _load();
                          }
                        : null,
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _PaymentNoteSheet extends StatefulWidget {
  const _PaymentNoteSheet({required this.title});
  final String title;
  @override
  State<_PaymentNoteSheet> createState() => _PaymentNoteSheetState();
}

class _PaymentNoteSheetState extends State<_PaymentNoteSheet> {
  final _text = TextEditingController();
  String? _error;
  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      20,
      0,
      20,
      MediaQuery.viewInsetsOf(context).bottom + 24,
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          widget.title,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _text,
          minLines: 3,
          maxLines: 5,
          maxLength: 1000,
          decoration: InputDecoration(
            labelText: 'Explain what happened',
            errorText: _error,
          ),
        ),
        FilledButton(
          onPressed: () {
            if (_text.text.trim().length < 10) {
              setState(() => _error = 'Use at least 10 characters.');
              return;
            }
            Navigator.pop(context, _text.text.trim());
          },
          child: const Text('Submit'),
        ),
      ],
    ),
  );
}

class _PaymentTransferSheet extends StatefulWidget {
  const _PaymentTransferSheet({
    required this.row,
    required this.dio,
    required this.base,
  });
  final Json row;
  final Dio dio;
  final String base;
  @override
  State<_PaymentTransferSheet> createState() => _PaymentTransferSheetState();
}

class _PaymentTransferSheetState extends State<_PaymentTransferSheet> {
  final _reference = TextEditingController();
  PickedPhoto? _receipt;
  bool _confirmed = false;
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _reference.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    try {
      final photo = await PhotoPicker().pick(
        context,
        reason: 'Attach the GCash transfer receipt for the rider to verify.',
        kind: UploadKind.proofPhoto,
      );
      if (mounted && photo != null) setState(() => _receipt = photo);
    } on PhotoRejected catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _send() async {
    final reference = _reference.text.replaceAll(RegExp(r'\s'), '');
    if (!RegExp(r'^\d{13}$').hasMatch(reference) ||
        _receipt == null ||
        !_confirmed) {
      setState(
        () => _error = 'Add a 13-digit GCash reference, receipt and transfer confirmation.',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.dio.post<Object?>(
        '${widget.base}/${widget.row['id']}/send',
        data: FormData.fromMap({
          'reference': reference,
          'receipt': _receipt!.toMultipart(),
          'confirmed': true,
        }),
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = ApiFailure.from(error).message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Record rider payment',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          Text(
            'Send ${formatPeso(asDouble(widget.row['amount']))} to ${widget.row['gcash_name']} (${widget.row['gcash_number']}) in GCash first. This screen records the transfer; it does not send money.',
            style: const TextStyle(height: 1.5),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _reference,
            enabled: !_busy,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'GCash reference (13 digits)',
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _busy ? null : _pick,
            icon: const Icon(Icons.add_photo_alternate_outlined),
            label: Text(
              _receipt == null
                  ? 'Attach transfer receipt'
                  : 'Receipt attached — change',
            ),
          ),
          if (_receipt != null)
            Image.memory(
              Uint8List.fromList(_receipt!.bytes),
              height: 130,
              fit: BoxFit.contain,
            ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: _confirmed,
            onChanged: _busy
                ? null
                : (value) => setState(() => _confirmed = value ?? false),
            title: const Text(
              'I sent this exact amount to the account above.',
              style: TextStyle(fontSize: 13),
            ),
          ),
          if (_error != null)
            Text(_error!, style: const TextStyle(color: Colors.red)),
          FilledButton(
            onPressed: _busy ? null : _send,
            child: Text(_busy ? 'Recording…' : 'Record transfer'),
          ),
        ],
      ),
    ),
  );
}
