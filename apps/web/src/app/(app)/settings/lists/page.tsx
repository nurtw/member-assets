"use client";

import Link from "next/link";
import { Suspense } from "react";

import { CodedList, LgaList } from "@/components/reference-list";
import {
  Loading,
  Notice,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { useSession } from "@/lib/session";
import { useTabParam } from "@/lib/use-tab-param";

/**
 * The Union's reference lists (item 39): designations, vehicle types, route
 * types, and local government areas. These are what the forms offer, and they
 * are the Union's to keep: nothing here needs a deploy (PRD §23.4).
 *
 * The open list is kept in the address, so a link can lead straight to one.
 */

const TABS = [
  { value: "designations", label: "Designations" },
  { value: "vehicle-types", label: "Vehicle types" },
  { value: "route-types", label: "Route types" },
  { value: "areas", label: "Local government areas" },
] as const;

function ReferenceLists() {
  const { holds } = useSession();
  const [tab, setTab] = useTabParam(TABS);

  return (
    <Tabs value={tab} onValueChange={setTab} className="grid gap-6">
      <TabsList aria-label="The reference lists">
        {TABS.map((entry) => (
          <TabsTrigger key={entry.value} value={entry.value}>
            {entry.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="designations" className="outline-none">
        <CodedList
          collection="designations"
          noun="designation"
          plural="designations"
          note={
            <p className="text-sm text-muted-foreground">
              The position a member holds, as printed on their card. The list is
              offered in this order on the registration form.
            </p>
          }
        />
      </TabsContent>

      <TabsContent value="vehicle-types" className="outline-none">
        <CodedList
          collection="vehicle-categories"
          noun="vehicle type"
          plural="vehicle types"
          note={
            <p className="text-sm text-muted-foreground">
              What kind of vehicle it is: a bus, a tricycle, a truck. Offered in
              this order on the vehicle form.
            </p>
          }
        />
      </TabsContent>

      <TabsContent value="route-types" className="outline-none">
        <CodedList
          collection="route-types"
          noun="route type"
          plural="route types"
          note={
            <Notice
              tone="info"
              title="The monthly levy is priced by route type"
            >
              A route type added here pays the levy’s standard amount until it
              is given its own.{" "}
              {holds("payment.read") ? (
                <Link
                  href="/settings/fees"
                  className="font-medium underline underline-offset-2"
                >
                  Set it under Fees
                </Link>
              ) : (
                "That is set under Fees."
              )}
            </Notice>
          }
        />
      </TabsContent>

      <TabsContent value="areas" className="outline-none">
        <LgaList />
      </TabsContent>
    </Tabs>
  );
}

export default function ReferenceListsPage() {
  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader
        title="Reference lists"
        description="What the forms offer to choose from. An entry is added, relabelled, moved, or switched off here; nothing is ever deleted, and a code is set once."
      />
      {/* The open list is read from the address, which a page built ahead of
          time may only do inside a Suspense boundary. */}
      <Suspense fallback={<Loading />}>
        <ReferenceLists />
      </Suspense>
    </div>
  );
}
