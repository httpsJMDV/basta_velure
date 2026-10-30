import '../auth/auth_routes.dart';

/// Every rider screen's address. All of them sit under `/rider`, so the router keeps them in the rider home. The
/// public "Become a rider" form is the exception: it opens signed out.
abstract final class RiderPaths {
  // The five tabs of the bottom bar, the same places as the website's menu.
  static const home = '/rider';
  static const pickups = '/rider/pickups';
  static const deliveries = '/rider/deliveries';
  static const earnings = '/rider/earnings';
  static const account = '/rider/account';

  static const handover = '/rider/pickups/handover';
  static const collect = '/rider/deliveries/collect';
  static const returns = '/rider/returns';
  static const cod = '/rider/cod';
  static const chats = '/rider/chats';
  static const notifications = '/rider/notifications';
  static const vehicle = '/rider/account/vehicle';
  static const license = '/rider/account/license';
  static const gcash = '/rider/account/gcash';

  static String chat(int threadId) => '/rider/chats/$threadId';
  static String document(String key) => '/rider/account/documents/$key';

  /// Signed out: the public application form.
  static const apply = AuthPaths.becomeRider;
}
