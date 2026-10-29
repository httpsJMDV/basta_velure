import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Riverpod retries a failed provider on its own; the app never retries by itself (a 429 must wait, and every
  // screen has its own Try again).
  runApp(ProviderScope(retry: (_, _) => null, child: const LovedItApp()));
}
