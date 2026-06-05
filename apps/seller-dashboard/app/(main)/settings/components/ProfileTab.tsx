import React from "react";
import { BusinessDetailsForm } from "./ProfileTab/BusinessDetailsForm";
import { OwnerDetailsForm } from "./ProfileTab/OwnerDetailsForm";
import { BrandDetailsForm } from "./ProfileTab/BrandDetailsForm";

export function ProfileTab() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* SECTION 1: Business Details */}
      <section>
        <h2 className="text-base font-semibold text-text-primary pb-4 border-b border-border-default mb-6">
          Business Details
        </h2>
        <BusinessDetailsForm />
      </section>

      {/* SECTION 2: Owner Details */}
      <section className="mt-6 pt-6 border-t border-border-default">
        <h2 className="text-base font-semibold text-text-primary mb-6">
          Owner ki Details
        </h2>
        <OwnerDetailsForm />
      </section>

      {/* SECTION 3: Brand Details */}
      <section>
        <BrandDetailsForm />
      </section>
    </div>
  );
}
