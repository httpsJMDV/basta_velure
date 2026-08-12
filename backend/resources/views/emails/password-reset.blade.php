<x-mail::message>
<div style="text-align:center; padding-bottom: 24px;">
  <span style="font-size: 28px; font-weight: 700; color: #A32D2D; letter-spacing: -0.5px;">Velure</span>
</div>

# Reset your password, {{ $name }}

We received a request to reset the password for your Velure account. Click the button below to choose a new password.

<x-mail::button :url="$resetUrl" color="red">
Reset Password
</x-mail::button>

This link will expire in **60 minutes**. If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.

For your security, never share this link with anyone.

— The Velure Team

---

<small style="color: #999;">If the button doesn't work, copy and paste this URL into your browser:<br>{{ $resetUrl }}</small>
</x-mail::message>
