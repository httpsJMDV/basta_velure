import 'app_user.dart';

/// The home screens of the one app (amaru.md, task A6). Sellers and admins keep using the website.
enum AppHome {
  buyer('/buyer', 'Shop'),
  rider('/rider', 'Rider'),
  logistics('/logistics', 'Logistics'),
  webOnly('/web-only', 'Website');

  const AppHome(this.path, this.label);

  final String path;
  final String label;
}

/// Every home this account may open, the one it lands on first.
///
/// The order follows the website's `roleHomePath`: a courier team member or an approved hub opens Logistics, an
/// active (or suspended) rider opens Rider, and everyone else opens the shop. A pending or refused application never
/// opens a portal; the person keeps shopping, as on the website.
List<AppHome> homesFor(AppUser user) {
  if (user.isAdmin) return const [AppHome.webOnly];

  final homes = <AppHome>[
    if (user.logisticsCompany?.isApproved == true ||
        user.sortingCenter?.isApproved == true)
      AppHome.logistics,
    if (user.rider?.opensRiderHome == true) AppHome.rider,
    // A rider account made by a courier or the public rider form has the `rider` role, and the buyer endpoints are
    // not all open to it (confirm receipt needs `role:buyer`), so it gets no shop.
    if (user.role != 'rider') AppHome.buyer,
  ];
  return homes.isEmpty ? const [AppHome.rider] : homes;
}

AppHome defaultHomeFor(AppUser user) => homesFor(user).first;
