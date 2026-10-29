import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../format.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../validation/rules.dart';

/// Date of birth from a date picker only, never typed. The latest date allowed is 18 years ago (Philippine date).
class DateOfBirthField extends FormField<DateTime> {
  DateOfBirthField({
    super.key,
    super.initialValue,
    String? serverError,
    ValueChanged<DateTime>? onChanged,
  }) : super(
         validator: (value) => Rules.dateOfBirth(value),
         builder: (field) {
           final latest = Rules.latestBirthDate();
           return InkWell(
             borderRadius: AppRadius.cardAll,
             onTap: () async {
               final picked = await showDatePicker(
                 context: field.context,
                 initialDate:
                     field.value ??
                     DateTime(latest.year - 7, latest.month, latest.day),
                 firstDate: DateTime(1900),
                 lastDate: latest,
                 initialEntryMode: DatePickerEntryMode.calendarOnly,
                 helpText: 'Date of birth',
               );
               if (picked != null) {
                 field.didChange(picked);
                 onChanged?.call(picked);
               }
             },
             child: InputDecorator(
               isEmpty: field.value == null,
               decoration: InputDecoration(
                 labelText: 'Date of birth',
                 errorText: field.errorText ?? serverError,
                 suffixIcon: const Icon(LucideIcons.calendar, size: 20),
               ),
               child: Text(
                 field.value == null
                     ? ''
                     : Fmt.date(
                         DateTime.utc(
                           field.value!.year,
                           field.value!.month,
                           field.value!.day,
                         ),
                       ),
                 style: const TextStyle(fontSize: 16),
               ),
             ),
           );
         },
       );
}

/// The password rules as a live checklist under the password box.
class PasswordChecklist extends StatelessWidget {
  const PasswordChecklist({super.key, required this.password});

  final String password;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpace.sm),
      child: Wrap(
        spacing: AppSpace.md,
        runSpacing: AppSpace.xs,
        children: [
          for (final check in Rules.passwordChecks(password))
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  check.ok ? LucideIcons.circleCheck : LucideIcons.circle,
                  size: 14,
                  color: check.ok
                      ? StatusTone.emerald.foreground
                      : AppColors.stone400,
                ),
                const SizedBox(width: 4),
                Text(
                  check.label,
                  style: TextStyle(
                    fontSize: 12,
                    color: check.ok
                        ? StatusTone.emerald.foreground
                        : AppColors.stone500,
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
