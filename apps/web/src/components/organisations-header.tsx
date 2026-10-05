"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { mutate } from "swr";

import { InviteOrganisationDialog } from "@/components/invite-organisation";
import { Button, PageHeader, TabLinks, buttonVariants } from "@/components/ui";
import { useSession } from "@/lib/session";

/**
 * The head of the Organisations screens (item 33): the title, the two ways an
 * organisation comes to be on the list, and the tabs between the
 * organisations themselves and the invitations sent.
 */
export function OrganisationsHeader() {
  const pathname = usePathname();
  const { holds } = useSession();
  const [inviting, setInviting] = useState(false);
  const canManage = holds("api_client.manage");

  return (
    <>
      <PageHeader
        title="Organisations"
        description="Outside organisations approved to check the Union’s records through the API, what each may ask, and the token it holds. Every change needs a reason and is recorded in the audit trail."
        actions={
          canManage ? (
            <>
              <Link
                href="/organisations/new"
                className={buttonVariants({ variant: "secondary" })}
              >
                Register directly
              </Link>
              <Button type="button" onClick={() => setInviting(true)}>
                <Plus aria-hidden />
                Invite organisation
              </Button>
            </>
          ) : null
        }
      />
      <TabLinks
        label="Organisations"
        tabs={[
          {
            href: "/organisations",
            label: "Organisations",
            active: pathname === "/organisations",
          },
          {
            href: "/organisations/invitations",
            label: "Invitations",
            active: pathname.startsWith("/organisations/invitations"),
          },
        ]}
      />
      <InviteOrganisationDialog
        open={inviting}
        onOpenChange={setInviting}
        onCreated={() => void mutate("/organisation-invitations")}
      />
    </>
  );
}
