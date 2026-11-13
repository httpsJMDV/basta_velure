import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import 'states.dart';

/// Android's back button (or the back swipe) inside a home with a dock. A screen opened over a tab still closes as
/// usual: its navigator handles the back first and this never hears of it. On a tab, back goes to the home tab; on the
/// home tab, it asks before leaving the app instead of closing it at once.
///
/// Wrap the shell's frame in it, so it sits on the shell's own page, under every tab.
class HomeBackGuard extends StatefulWidget {
  const HomeBackGuard({
    super.key,
    required this.shell,
    required this.child,
    this.homeBranch = 0,
  });

  final StatefulNavigationShell shell;
  final Widget child;

  /// The branch back leads to, and the one where back asks to leave.
  final int homeBranch;

  @override
  State<HomeBackGuard> createState() => _HomeBackGuardState();
}

class _HomeBackGuardState extends State<HomeBackGuard> {
  // A second press while the question is open closes the dialog (it is on top), so this only stops a double tap
  // landing before the dialog has opened.
  bool _asking = false;

  Future<void> _onBack() async {
    final shell = widget.shell;
    if (shell.currentIndex != widget.homeBranch) {
      HapticFeedback.selectionClick();
      shell.goBranch(widget.homeBranch);
      return;
    }
    if (_asking) return;
    _asking = true;
    try {
      final leave = await confirmAction(
        context,
        title: 'Leave Loved-IT?',
        message: 'Do you want to close the app?',
        confirmLabel: 'Leave',
        cancelLabel: 'Stay',
      );
      if (leave) await SystemNavigator.pop();
    } finally {
      _asking = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _onBack();
      },
      child: widget.child,
    );
  }
}
