import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../data/buyer_api.dart';
import '../widgets/buyer_widgets.dart';

/// Send feedback about Loved-IT (B13): 3 to 1,000 characters.
class FeedbackScreen extends ConsumerStatefulWidget {
  const FeedbackScreen({super.key});

  @override
  ConsumerState<FeedbackScreen> createState() => _FeedbackScreenState();
}

class _FeedbackScreenState extends ConsumerState<FeedbackScreen> {
  final _form = GlobalKey<FormState>();
  final _message = TextEditingController();
  ApiFailure? _failure;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _failure = null);
    if (!_form.currentState!.validate()) return;
    try {
      final message = await ref
          .read(buyerApiProvider)
          .sendFeedback(_message.text.trim());
      if (!mounted) return;
      showSnack(context, message);
      context.pop();
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Send feedback')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(AppSpace.lg),
          children: [
            const Text(
              'Tell us what works and what doesn’t. The Loved-IT team reads every message.',
              style: TextStyle(color: AppColors.stone600),
            ),
            const SizedBox(height: AppSpace.lg),
            if (_failure != null && _failure!.fieldErrors.isEmpty) ...[
              MessageBanner(message: _failure!.message),
              const SizedBox(height: AppSpace.md),
            ],
            AppTextField(
              label: 'Your feedback',
              controller: _message,
              minLines: 4,
              maxLines: 8,
              maxLength: 1000,
              showCounter: true,
              textCapitalization: TextCapitalization.sentences,
              validator: (value) =>
                  Rules.words(value, 'Your feedback', min: 3, max: 1000),
              serverError: _failure?.errorFor('message'),
            ),
            const SizedBox(height: AppSpace.xl),
            SubmitButton(
              label: 'Send',
              busyLabel: 'Sending…',
              onPressed: _send,
            ),
          ],
        ),
      ),
    );
  }
}

final _policiesProvider = FutureProvider.autoDispose<Json>(
  (ref) => ref.watch(buyerApiProvider).policies(),
);

/// The return policy as the admin set it (`GET /platform/policies`).
class PoliciesScreen extends ConsumerWidget {
  const PoliciesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final policies = ref.watch(_policiesProvider);
    return Scaffold(
      backgroundColor: AppColors.stone50,
      appBar: AppBar(title: const Text('Policies')),
      body: policies.when(
        loading: () => const SkeletonList(count: 3),
        error: (error, _) => ErrorRetry(
          failure: ApiFailure.from(error),
          onRetry: () => ref.invalidate(_policiesProvider),
        ),
        data: (data) {
          final returns = asJson(data['return_policy']);
          final excluded = asJson(returns['non_returnable_categories']);
          return ListView(
            padding: const EdgeInsets.only(top: AppSpace.md),
            children: [
              BlockCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Returns and refunds',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: AppSpace.sm),
                    if (asString(returns['summary']) != null)
                      Text(
                        asString(returns['summary'])!,
                        style: const TextStyle(height: 1.5),
                      ),
                    const SizedBox(height: AppSpace.md),
                    InfoRow(
                      'Return window',
                      '${asInt(returns['return_window_days'], 7)} days after delivery',
                    ),
                    InfoRow(
                      'Shop answers within',
                      '${asInt(returns['seller_response_days'], 3)} days',
                    ),
                    InfoRow(
                      'Ask Loved-IT within',
                      '${asInt(returns['escalation_days'], 3)} days',
                    ),
                  ],
                ),
              ),
              if (excluded.isNotEmpty)
                BlockCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Items that can’t be returned',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      for (final entry in excluded.entries) ...[
                        const SizedBox(height: AppSpace.md),
                        Text(
                          entry.key,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        Text(
                          '${entry.value}',
                          style: const TextStyle(
                            color: AppColors.stone600,
                            height: 1.45,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              if (asString(returns['mediation_terms']) != null)
                BlockCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'When a shop refuses',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: AppSpace.sm),
                      Text(
                        asString(returns['mediation_terms'])!,
                        style: const TextStyle(height: 1.5),
                      ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
