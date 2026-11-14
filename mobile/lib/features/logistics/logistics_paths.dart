/// Every logistics address. Hub staff work under `/logistics/hub`, the courier team under `/logistics/courier`; the
/// router sends `/logistics` to the right one.
abstract final class LogisticsPaths {
  static const hubPickupControl = '/logistics/hub/pickup-control';
  static const courierPickupControl = '/logistics/courier/pickup-control';
  static const root = '/logistics';

  // Hub staff: the tabs
  static const hubHome = '/logistics/hub';
  static const hubSorting = '/logistics/hub/sorting';
  static const hubDispatch = '/logistics/hub/dispatch';
  static const hubMore = '/logistics/hub/more';

  // Hub staff: everything that opens over the tabs
  static const hubScan = '/logistics/hub/scan';
  static const hubIntake = '/logistics/hub/intake';
  static const hubAwaiting = '/logistics/hub/dispatch/awaiting';
  static const hubDeliveries = '/logistics/hub/deliveries';
  static const hubRiders = '/logistics/hub/riders';
  static const hubChats = '/logistics/hub/messages';
  static const hubCourierChat = '/logistics/hub/messages/courier';

  /// Opens the scanner in its Sort mode.
  static const hubScanSort = '$hubScan?mode=sort';

  static String hubSortingGroup(String code) => '$hubSorting/$code';
  static String hubBatch(String code) => '$hubDispatch/batches/$code';
  static String hubRider(int id) => '$hubRiders/$id';
  static String hubRiderAreas(int id) => '$hubRiders/$id/areas';
  static String hubRiderChat(int id) => '$hubChats/riders/$id';

  // Courier team: the tabs
  static const courierHome = '/logistics/courier';
  static const courierHubs = '/logistics/courier/hubs';
  static const courierParcels = '/logistics/courier/parcels';
  static const courierRiders = '/logistics/courier/riders';
  static const courierMore = '/logistics/courier/more';

  // Courier team: everything that opens over the tabs
  static const courierDispatch = '/logistics/courier/dispatch';
  static const courierScan = '/logistics/courier/scan';
  static const courierCod = '/logistics/courier/cod';
  static const courierChats = '/logistics/courier/messages';
  static const courierAddRider = '/logistics/courier/riders/add';
  static const courierTrucks = '/logistics/courier/trucks';
  static const courierReturns = '/logistics/courier/returns';
  static const courierMoney = '/logistics/courier/money';
  static const courierShipping = '/logistics/courier/shipping';
  static const courierSettings = '/logistics/courier/settings';
  static const courierCoverage = '/logistics/courier/coverage';
  static const courierPlanning = '/logistics/courier/truck-planning';
  static const hubEarnings = '/logistics/hub/earnings';
  static const hubSettings = '/logistics/hub/settings';
  static const courierActivity = '/logistics/courier/activity';
  static const hubActivity = '/logistics/hub/activity';
  static const hubReturnPickups = '/logistics/hub/return-pickups';

  /// Buyers from very remote towns who collect their parcel at the hub counter.
  static const hubCounter = '/logistics/hub/counter';

  /// Failed and returned parcels.
  static const courierProblems = '$courierParcels?problems=1';

  static String courierHub(int id) => '$courierHubs/$id';
  static String courierParcel(int id) => '$courierParcels/$id';
  static String courierRider(int id) => '$courierRiders/$id';
  static String courierChat(int id) => '$courierChats/$id';

  // Office work stays on the website (liam.md, mobile scope).
  static const webHubReports = '/hub/reports';
  static const webHubEarnings = '/hub/earnings';
  static const webHubSettings = '/hub/settings';
  static const webCourierShipping = '/logistics/shipping';
  static const webCourierMoney = '/logistics/money';
  static const webCourierReports = '/logistics/reports';
  static const webCourierReturns = '/logistics/returns';
  static const webCourierSettings = '/logistics/settings';
}
