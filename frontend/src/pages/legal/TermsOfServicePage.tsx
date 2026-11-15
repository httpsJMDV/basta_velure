import LegalLayout, { LegalPoint, type LegalSection } from '../../components/legal/LegalLayout';

const SECTIONS: { id: string; title: string; points: { title: string; text: string }[] }[] = [
  {
    id: 'acceptance',
    title: 'Acceptance of these terms',
    points: [
      { title: 'Agreement', text: 'By using Loved-IT, whether as a guest, buyer, seller, rider, hub or courier company, you agree to these Terms of Use and to our Privacy Policy. If you do not agree, please do not use the platform.' },
      { title: 'Changes', text: 'We may update these terms. When a change matters, we tell you by email or with a notice on the site before it takes effect. Using Loved-IT after that means you accept the updated terms.' },
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts',
    points: [
      { title: 'Who can sign up', text: 'You must be at least 18 years old to create an account. The details you give us, including your ID, must be true and your own.' },
      { title: 'Keeping your account safe', text: 'Keep your password to yourself; you are responsible for what happens under your account. If you think someone else has used it, change your password and tell our support team through Chat with support.' },
      { title: 'One account per person', text: 'Each person may have one buyer account. Seller, rider, hub and courier roles are added to that same account after their application is approved. Duplicate accounts may be suspended.' },
    ],
  },
  {
    id: 'buying',
    title: 'Buying on Loved-IT',
    points: [
      { title: 'Orders', text: 'Placing an order is an offer to buy at the listed price. The sale is between you and the shop; Loved-IT runs the marketplace and is not a party to that sale.' },
      { title: 'Prices and payment', text: 'Prices are in Philippine pesos. For platform GCash orders, pay the Loved-IT collection account shown at checkout and upload the receipt; an admin verifies the actual transfer. Older direct GCash orders are verified by the shop. For COD, pay the courier rider at delivery. Always use the account and instructions recorded on your order.' },
      { title: 'Cancellations and returns', text: 'Cancel while the order still offers cancellation in My Orders. For damaged, wrong or misdescribed items, request a return during the published return window and before confirming delivery. Confirmation completes the order and closes the standard in-app return/refund request. Existing cases continue through their case workflow. Loved-IT reviews escalated cases.' },
      { title: 'Refund transfers', text: 'Approval opens a refund case and does not mean a transfer has been sent. Loved-IT refunds platform-collected GCash; the seller refunds direct GCash and COD. Give your GCash account, check the recorded receipt and reference, then confirm receipt or report a missing transfer. Following review, a missing transfer can be sent again with a new reference; earlier transfers stay in the history.' },
      { title: 'Warranty after completion', text: 'Order completion does not cancel an applicable seller or manufacturer warranty or statutory remedies for defective goods. Keep your order number, receipt, evidence and warranty details. Contact the seller for assessment, repair, replacement or refund as applicable. Contact Loved-IT support if unresolved. Coverage depends on the product and warranty terms; confirmation is not a waiver of applicable consumer rights.' },
    ],
  },
  {
    id: 'delivery',
    title: 'Delivery',
    points: [
      { title: 'Delivery fee', text: 'Each shop in your cart ships its own parcel. Its fee comes from the courier\'s rate for the route between the shop and your address, for the parcel\'s weight rounded up to the next whole kilogram, and is shown before you place the order. A shop may deliver free when your order from it reaches a minimum the shop sets; it then pays the courier itself.' },
      { title: 'Return collection', text: 'If the item must be collected, a local courier rider collects it with proof. Nearby returns may go directly to the shop. Cross-hub returns travel through the courier network from the buyer-side hub to the shop-side hub, then a local rider delivers to the shop and the shop confirms receipt.' },
      { title: 'Couriers', text: 'Parcels are carried by partner couriers. Loved-IT assigns each parcel to the courier whose hubs cover the shop and your address; you can follow it with its tracking number.' },
    ],
  },
  {
    id: 'selling',
    title: 'Selling on Loved-IT',
    points: [
      { title: 'Seller verification', text: 'To sell, you apply from your buyer account with your ID and business documents. Loved-IT reviews every application and may decline one.' },
      { title: 'Seller responsibilities', text: 'Sellers keep listings accurate, keep stock up to date, ship on time and follow Philippine law, including consumer protection rules. Misrepresenting a product can lead to suspension.' },
      { title: 'Prohibited items', text: 'You may not list counterfeit goods, items that infringe someone\'s intellectual property, hazardous materials or anything Philippine law prohibits. We may remove such listings and suspend the shop.' },
      { title: 'Payments and commission', text: 'Platform-collected GCash earnings use the category commission rate recorded on each order item. Commission and any seller-funded shipping charge are deducted before net earnings become available for a payout after completion and any configured hold. Admins send the requested GCash payout manually and record its reference and receipt before completing it. Direct payments and COD remain with the shop or courier; COD is settled by the courier and direct-order commissions use monthly statements. Those funds cannot also be withdrawn as platform payouts.' },
    ],
  },
  {
    id: 'conduct',
    title: 'What you may not do',
    points: [
      { title: 'Prohibited conduct', text: 'Do not use Loved-IT for anything unlawful; try to get into accounts or systems that are not yours; post false or defamatory content; manipulate prices or write fake reviews; scrape the site with automated tools; or interfere with its security.' },
      { title: 'If the rules are broken', text: 'We may suspend or close the account, remove listings, hold any payout we still owe while we investigate, and report the matter to the authorities when the law requires it.' },
    ],
  },
  {
    id: 'content',
    title: 'Content and intellectual property',
    points: [
      { title: 'Our content', text: 'The Loved-IT name, logo, design and software belong to us or our licensors. Please do not copy or reuse them without written permission.' },
      { title: 'Your content', text: 'When you upload product photos, reviews or other content, you let us show it on Loved-IT and use it to run and promote the marketplace. You keep ownership of it.' },
    ],
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    points: [
      { title: 'A marketplace', text: 'Loved-IT connects buyers and shops. We do not make, store or inspect the products listed, and we are not responsible for their quality, safety or legality; the shop is.' },
      { title: 'Limit', text: 'As far as the law allows, our liability for any claim about your use of Loved-IT is limited to the amount you paid in the transaction that led to the claim.' },
    ],
  },
  {
    id: 'law',
    title: 'Governing law',
    points: [
      { title: 'Philippine law', text: 'These terms are governed by the laws of the Republic of the Philippines. Disputes are settled by the proper courts of the Philippines.' },
    ],
  },
];

export default function TermsOfServicePage() {
  const sections: LegalSection[] = SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    body: s.points.map((p) => <LegalPoint key={p.title} title={p.title}><p>{p.text}</p></LegalPoint>),
  }));
  return (
    <LegalLayout
      doc="terms"
      title="Terms of use"
      updated="November 16, 2026"
      intro={<p>These terms cover how you can use Loved-IT, whether you shop, sell, deliver or run a hub. They are written to be read, so please take a few minutes.</p>}
      sections={sections}
    />
  );
}
