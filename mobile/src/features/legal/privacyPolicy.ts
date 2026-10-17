/**
 * Xspeeria Privacy Policy, transcribed verbatim from the Figma "Terms and Conditions"
 * frames (2026-10-17). Only layout artefacts were tidied (line wraps, a stray "1. 2. 3. 4. 5."
 * list prefix). The wording is the product owner's.
 *
 * DRAFT — NOT LEGALLY REVIEWED. Several statements conflict with the approved docs or are
 * unverified compliance claims; see ADR-007 §3 "Terms and Conditions". Do not release until
 * Legal approves the text.
 */

export type PolicyBlock =
  | { readonly kind: 'p'; readonly text: string }
  | { readonly kind: 'sub'; readonly text: string }
  | { readonly kind: 'bullet'; readonly text: string };

export interface PolicySection {
  readonly title: string;
  readonly blocks: readonly PolicyBlock[];
}

export interface PolicyDocument {
  readonly title: string;
  readonly effective: string;
  readonly updated: string;
  readonly sections: readonly PolicySection[];
}

const p = (text: string): PolicyBlock => ({ kind: 'p', text });
const sub = (text: string): PolicyBlock => ({ kind: 'sub', text });
const b = (text: string): PolicyBlock => ({ kind: 'bullet', text });

export const PRIVACY_POLICY: PolicyDocument = {
  title: 'Xspeeria — Privacy Policy',
  effective: 'October 1, 2025',
  updated: 'August 1, 2025',
  sections: [
    {
      title: '1. Introduction',
      blocks: [
        p(
          'At Xspeeria, we value your trust and are committed to safeguarding your personal information. This Privacy Policy explains how we collect, use, store, share, and protect your data when you use our platform, mobile app, website, APIs, and related services (collectively, the “Platform”).',
        ),
        p(
          'We comply with the highest global data protection standards — including GDPR (EU/UK), CCPA (California), NDPR (Nigeria), and PIPEDA (Canada) — and ensure transparency in every interaction.',
        ),
        p('By using Xspeeria, you agree to the practices described here. If you do not agree, please do not use our services.'),
      ],
    },
    {
      title: '2. Who We Are',
      blocks: [
        p(
          'Xspeeria is a product of IntelYtics Limited, a fintech innovation company registered in Canada and Nigeria, with technology development in the UK. We operate through licensed financial partners worldwide to facilitate secure, transparent, peer-to-peer FX exchanges without storing user funds.',
        ),
      ],
    },
    {
      title: '3. Information We Collect',
      blocks: [
        p('We collect the following categories of information:'),
        sub('A. Information You Provide Directly'),
        b('Account Information — Name, date of birth, address, nationality, contact details.'),
        b('KYC Documentation — Government-issued IDs, proof of address, biometric verification (as required by regulations in your country).'),
        b('Transaction Details — Currency type, amount, exchange rate, and transaction history.'),
        b('Communications — Chat messages with support, dispute resolution conversations.'),
        sub('B. Information We Collect Automatically'),
        b('Device Data — IP address, browser type, device model, OS version, unique device identifiers.'),
        b('Usage Data — Login times, features used, clicks, and navigation patterns.'),
        b('Location Data — Approximate geolocation based on IP (for compliance and fraud prevention).'),
        sub('C. Information from Third Parties'),
        b('Verification data from KYC API providers, government registries, and sanctions lists.'),
        b('Transaction settlement data from partner banks and financial institutions.'),
      ],
    },
    {
      title: '4. How We Use Your Information',
      blocks: [
        p('We process your data for:'),
        b('Service Delivery — To create and manage your account, match FX offers, and complete settlements.'),
        b('Compliance — KYC/AML checks, fraud detection, sanctions screening.'),
        b('Security — Monitoring suspicious activities, preventing unauthorized access.'),
        b('Enhancement — Improving the user experience through analytics and AI rate optimization.'),
        b('Communication — Sending confirmations, alerts, policy updates, and promotional materials (where permitted).'),
      ],
    },
    {
      title: '5. Legal Basis for Processing',
      blocks: [
        p('We process your personal data under the following legal grounds:'),
        b('Contractual necessity — To provide the services you request.'),
        b('Legal obligation — Compliance with financial regulations and AML laws.'),
        b('Legitimate interests — Improving platform security and efficiency.'),
        b('Consent — For optional marketing communications.'),
      ],
    },
    {
      title: '6. Data Sharing',
      blocks: [
        p('We do not sell your data. We share your information only with:'),
        b('Licensed Escrow & Settlement Partners — To facilitate transactions.'),
        b('KYC/AML Providers — For identity verification.'),
        b('Regulators & Law Enforcement — Where legally required.'),
        b('Technology Partners — For secure hosting, analytics, and fraud prevention.'),
        p('All partners are bound by strict confidentiality agreements and data protection obligations.'),
      ],
    },
    {
      title: '7. Data Storage & Security',
      blocks: [
        b('We store your data on secure, encrypted servers located in compliance with regional laws (e.g., GDPR-compliant data centers in the EU).'),
        b('Encryption — All personal data is encrypted in transit (TLS 1.3) and at rest (AES-256).'),
        b('Access Control — Limited to vetted personnel with role-based permissions.'),
        b('Incident Response — In the event of a data breach, we will notify affected users and regulators within legally mandated timelines.'),
      ],
    },
    {
      title: '8. International Transfers',
      blocks: [
        p('Where your data is transferred across borders, we ensure:'),
        b('Adequacy decisions (GDPR-approved countries).'),
        b('Standard contractual clauses.'),
        b('Binding corporate rules with our partners.'),
      ],
    },
    {
      title: '9. Data Retention',
      blocks: [
        p('We retain personal data:'),
        b('KYC records — Minimum 5 years after account closure (per AML laws).'),
        b('Transaction data — Minimum 7 years (per financial regulations).'),
        b('Other data — As long as necessary for the purpose collected or as required by law.'),
      ],
    },
    {
      title: '10. Your Rights',
      blocks: [
        p('Depending on your jurisdiction, you may have the right to:'),
        b('Access, correct, or delete your personal data.'),
        b('Restrict or object to data processing.'),
        b('Withdraw consent for marketing.'),
        b('Port your data to another provider.'),
        b('File a complaint with your local data protection authority.'),
        p('Requests can be made via [Data Protection Contact Email].'),
      ],
    },
    {
      title: '11. Cookies & Tracking',
      blocks: [
        p('We use cookies to enhance your experience and analyze usage.'),
        b('Necessary cookies — Enable platform functionality.'),
        b('Analytics cookies — Monitor performance (opt-out available).'),
        b('Security cookies — Detect and prevent fraud.'),
        p('You can manage cookies via your browser settings.'),
      ],
    },
    {
      title: '12. Children’s Privacy',
      blocks: [p('Xspeeria is not intended for individuals under 18. We do not knowingly collect personal data from minors.')],
    },
    {
      title: '13. Changes to this Policy',
      blocks: [p('We may update this policy periodically. Changes will be communicated via email and posted on the Platform.')],
    },
    {
      title: '14. Contact',
      blocks: [
        p('Xspeeria — IntelYtics Limited'),
        p('Nigeria & Canada'),
        p('Email: Xspeeria@intelyticslimited.com'),
        p('Phone: +234701399012'),
      ],
    },
  ],
};
