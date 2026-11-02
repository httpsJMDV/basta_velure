import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/session/session.dart';
import '../../auth/sign_in_screen.dart';

/// Sign-in on top of whatever is open, which stays as it is underneath: afterwards they are back where they were, down
/// to the scroll and the quantity they chose. With [next], that dock tab opens afterwards.
Future<void> showSignInOver(BuildContext context, {String? next}) =>
    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute<void>(
        builder: (_) => SignInScreen(closeWhenDone: true, next: next),
      ),
    );

/// A guest can look around, like on the website. Anything that needs an account goes to sign-in first and comes back to
/// this screen afterwards. Returns true when it went, so the caller stops there.
bool sendGuestToSignIn(BuildContext context, WidgetRef ref) {
  if (ref.read(currentUserProvider) != null) return false;
  showSignInOver(context);
  return true;
}
