<x-mail::message>
<div style="text-align:center; padding-bottom: 8px;">
  <span style="font-size: 28px; font-weight: 700; color: #A32D2D; letter-spacing: -0.5px;">Velure</span>
</div>

<div style="text-align:center; padding-bottom: 24px;">
  <span style="font-size: 13px; color: #999; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">Seller Application</span>
</div>

# Application Received, {{ $firstName }}!

Thank you for applying to become a seller on **Velure**. We've successfully received your application for **{{ $shopName }}** and it is now under review.

---

**What happens next?**

Our admin team will carefully review your submitted details and government ID. This process typically takes **1–3 business days**.

You will receive a follow-up email once a decision has been made. In the meantime, you can log in to your account — your dashboard will show your current application status.

<x-mail::panel>
⏳ &nbsp;**Application Status: Under Review**

Your shop **{{ $shopName }}** is pending admin verification. You will be notified by email once approved.
</x-mail::panel>

<x-mail::button :url="$loginUrl" color="red">
View My Application Status
</x-mail::button>

If you have any questions or need to update your submitted information, please contact our support team.

Warm regards,
**The Velure Team**

---

<small style="color: #999;">You received this email because a seller application was submitted using this email address on Velure. If this wasn't you, please contact us immediately.</small>
</x-mail::message>
