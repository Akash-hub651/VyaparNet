"use client";

import React, { useEffect, useState } from "react";
import { useHeader } from "../../../app/contexts/header.context";
import { QuickHelpCard } from "./QuickHelpCard";
import { FAQAccordion, FAQSectionData } from "./FAQAccordion";
import { ContactForm } from "./ContactForm";

// --- Icons ---
function ShoppingCartIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>;
}
function PackageIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>;
}
function WalletIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" /><circle cx="18" cy="12" r="2" /></svg>;
}

// Same icons but smaller for FAQ headers
function ShoppingCartIconSmall() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>;
}
function PackageIconSmall() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>;
}
function WalletIconSmall() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" /><circle cx="18" cy="12" r="2" /></svg>;
}
function ShieldIconSmall() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
}

const FAQ_DATA: FAQSectionData[] = [
  {
    id: "faq-orders",
    title: "Orders ke baare mein",
    icon: <ShoppingCartIconSmall />,
    items: [
      {
        id: "q-order-1",
        question: "Order confirm kaise karein?",
        answer: "Dashboard pe Orders section mein jaiye. PLACED status wale order pe click karein. 'Confirm Order' button pe click karein. Order confirmed ho jayega. Buyer ko notification jaayega.",
      },
      {
        id: "q-order-2",
        question: "Tracking number add kaise karein?",
        answer: "Order confirmed karne ke baad, 'Mark as Shipped' button dikhega. Carrier choose karein, tracking number daalo, aur submit karein. Buyer ko tracking details milegi.",
      },
      {
        id: "q-order-3",
        question: "Order cancel kaise karein?",
        answer: "Order confirm hone ke baad cancel karna difficult hai. PLACED status mein cancel karna zyada aasaan hai. Order detail mein Cancel option hoga. Cancel karne ki wajah batani hogi. Baar-baar cancel karna seller score affect karta hai.",
      },
      {
        id: "q-order-4",
        question: "Order 4 ghante purana ho gaya — kya hoga?",
        answer: "4 ghante se purane pending orders se seller score affect hota hai. Jaldi confirm karein. Agar nahi kar sakte toh cancel karein — yeh bhi score affect karega, lekin delay se zyada nahi.",
      },
    ],
  },
  {
    id: "faq-products",
    title: "Products ke baare mein",
    icon: <PackageIconSmall />,
    items: [
      {
        id: "q-prod-1",
        question: "Product reject kyun hua?",
        answer: "Products section mein jaiye, Rejected tab kholo. Product pe click karein. Rejection reasons wahan diye honge. Common reasons: poor quality images, incomplete description, wrong segment, incorrect GST rate.",
      },
      {
        id: "q-prod-2",
        question: "Product review mein kitna waqt lagta hai?",
        answer: "Normal processing: 24-48 ghante. Busy periods mein 72 ghante tak lag sakte hain. Aapko notification milegi jab review complete hoga.",
      },
      {
        id: "q-prod-3",
        question: "Product live hone ke baad kya hoga?",
        answer: "ACTIVE status milegi. Buyers marketplace mein product dekh sakte hain. Orders aane lagne chahiye. Analytics mein views aana shuru ho jayenge.",
      },
    ],
  },
  {
    id: "faq-kyc",
    title: "KYC ke baare mein",
    icon: <ShieldIconSmall />,
    items: [
      {
        id: "q-kyc-1",
        question: "KYC ke liye kaun se documents chahiye?",
        answer: "Settings > KYC section mein required documents ki puri list hai. Generally: GST Certificate, PAN Card, Aadhar Card, Bank Statement. Sab PDF ya clear photo mein upload karein.",
      },
      {
        id: "q-kyc-2",
        question: "KYC reject ho gaya — kya karein?",
        answer: "Settings > KYC mein jaiye. Rejection reasons padein. Galat ya unclear documents ko replace karein aur dobara submit karein. Common issue: document readable nahi tha ya expired tha.",
      },
      {
        id: "q-kyc-3",
        question: "KYC verify hone mein kitna waqt lagta hai?",
        answer: "24-48 ghante maximum. Aapko notification milegi. Verify hone ke baad RFQ aur sab features unlock ho jayenge.",
      },
    ],
  },
  {
    id: "faq-payouts",
    title: "Payouts ke baare mein",
    icon: <WalletIconSmall />,
    items: [
      {
        id: "q-pay-1",
        question: "Payout kab aayega?",
        answer: "Order complete hone ke 5-7 working days mein payout initiate hota hai. Bank account verify hona chahiye. Finance section mein payout status dekh sakte hain.",
      },
      {
        id: "q-pay-2",
        question: "Payout amount expected se kam kyun aaya?",
        answer: "Payout mein platform fee (usually 7%) deduct hoti hai. GST bhi apply hoti hai. Payout breakdown Finance section mein milega.",
      },
      {
        id: "q-pay-3",
        question: "Bank account verify kaise karein?",
        answer: "Settings > Bank Account mein jaiye. Account details daalo. Verify button click karo. ₹1 micro-deposit aayega 24-48 ghante mein. Confirm karne ke baad bank account verified ho jayega.",
      },
    ],
  },
];

export default function SupportPage() {
  const { setTitle } = useHeader();
  const [targetFaq, setTargetFaq] = useState<string | null>(null);
  
  useEffect(() => {
    setTitle("Help & Support");
  }, [setTitle]);

  // Mobile check for bottom nav "More" active state is typically handled in layout/nav component via pathname.
  // We don't need to do anything here for M-05 FIX as usePathname will be '/support'.

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto animate-[fadeIn_300ms_ease-out]">
      {/* ROW A: PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Help & Support</h1>
          <p className="text-sm text-text-secondary mt-1">Hum yahan hain — aapki help ke liye</p>
        </div>
        <a
          href="https://wa.me/919876543210" // Example WhatsApp Link
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-border-default bg-surface-card hover:bg-brand-50 hover:text-brand-700 hover:border-brand-500 text-sm font-medium text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 w-max"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          WhatsApp pe contact karein
        </a>
      </div>

      {/* ROW B: QUICK HELP CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickHelpCard
          title="Order se judi problem?"
          subtitle="Confirm, ship, cancel kaise karein"
          icon={<ShoppingCartIcon />}
          onClick={() => setTargetFaq("faq-orders")}
        />
        <QuickHelpCard
          title="Product se judi problem?"
          subtitle="Rejection, approval, listing issues"
          icon={<PackageIcon />}
          onClick={() => setTargetFaq("faq-products")}
        />
        <QuickHelpCard
          title="Payment ya KYC problem?"
          subtitle="Payout, bank verify, KYC rejection"
          icon={<WalletIcon />}
          onClick={() => setTargetFaq("faq-payouts")}
        />
      </div>

      {/* ROW C: FAQ ACCORDION */}
      <section aria-label="Frequently Asked Questions">
        <FAQAccordion sections={FAQ_DATA} targetSectionId={targetFaq} />
      </section>

      {/* ROW D: CONTACT FORM */}
      <section aria-label="Contact Support" className="max-w-xl">
        <ContactForm />
      </section>

      {/* ROW E: RESPONSE TIME + CONTACT INFO */}
      <div className="text-center text-xs text-text-secondary pt-8 pb-4">
        <p>Support team response time: 24 ghante ke andar</p>
        <p className="mt-1">Email: <a href="mailto:support@vyaparnet.com" className="text-brand-600 hover:underline">support@vyaparnet.com</a></p>
      </div>
    </div>
  );
}
