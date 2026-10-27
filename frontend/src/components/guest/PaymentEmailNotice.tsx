import { MailCheck } from "lucide-react";
import { translateText, useLanguage } from "../../i18n/language";

export function PaymentEmailNotice({ email }: { email?: string }) {
  useLanguage();
  return <aside className="payment-email-notice" role="status" aria-live="polite">
    <MailCheck aria-hidden="true" />
    <div>
      <h2>{translateText("Check your email for your booking details")}</h2>
      <p>{translateText("Look for your booking confirmation and payment receipt in the email address used for this booking.")}</p>
      {email && <strong className="payment-email-address" dir="ltr">{email}</strong>}
      <p className="payment-email-help">{translateText("Delivery may take a few minutes. If you do not see the email, check your spam or junk folder, or contact the hotel for help.")}</p>
    </div>
  </aside>;
}
