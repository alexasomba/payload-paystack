"use client";

import { useEffect, useState } from "react";

type Props = {
  transactionsSlug?: string;
  plansSlug?: string;
  subscriptionsSlug?: string;
  refundsSlug?: string;
  disputesSlug?: string;
};

type Transaction = {
  id: string | number;
  reference?: string;
  planCode?: string;
  subscriptionCode?: string;
  providerId?: string;
  transactionReference?: string;
  email?: string;
  amount?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
};

export function PaystackAdmin({
  transactionsSlug = "paystack-transactions",
  plansSlug,
  subscriptionsSlug,
  refundsSlug,
  disputesSlug,
}: Props) {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [subscriptions, setSubscriptions] = useState<Transaction[]>([]);
  const [plans, setPlans] = useState<Transaction[]>([]);
  const [refunds, setRefunds] = useState<Transaction[]>([]);
  const [disputes, setDisputes] = useState<Transaction[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async (slug: string) => {
      const response = await fetch("/api/" + slug + "?limit=12&sort=-createdAt", {
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Could not load Paystack billing records.");
      return (await response.json()) as { docs?: Transaction[] };
    };
    void Promise.all([
      load(transactionsSlug),
      load(plansSlug ?? "paystack-plans"),
      load(subscriptionsSlug ?? "paystack-subscriptions"),
      load(refundsSlug ?? "paystack-refunds"),
      load(disputesSlug ?? "paystack-disputes"),
    ])
      .then(([transactionData, planData, subscriptionData, refundData, disputeData]) => {
        if (!active) return;
        setRows(transactionData.docs ?? []);
        setPlans(planData.docs ?? []);
        setSubscriptions(subscriptionData.docs ?? []);
        setRefunds(refundData.docs ?? []);
        setDisputes(disputeData.docs ?? []);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load payments.");
      });
    return () => {
      active = false;
    };
  }, [disputesSlug, plansSlug, refundsSlug, subscriptionsSlug, transactionsSlug]);

  return (
    <main className="payload-paystack-admin">
      <h1>Paystack payments</h1>
      <p>Recent transactions, subscriptions, refunds, and dispute events.</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="payload-paystack-admin__panel">
        <h2>Recent transactions</h2>
        {rows.length === 0 && !error ? <p>No transactions yet.</p> : null}
        {rows.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Customer</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.reference ?? "—"}</td>
                  <td>{row.email ?? "—"}</td>
                  <td>
                    {typeof row.amount === "number"
                      ? (() => {
                          const currency = row.currency ?? "NGN";
                          const formatter = new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency,
                          });
                          const exponent = formatter.resolvedOptions().maximumFractionDigits ?? 2;
                          return formatter.format(row.amount / 10 ** exponent);
                        })()
                      : "—"}
                  </td>
                  <td>
                    <span className="payload-paystack-admin__status">{row.status ?? "pending"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
      <div className="payload-paystack-admin__panel">
        <h2>Plans</h2>
        {plans.length ? (
          <ul>{plans.map((row) => <li key={row.id}>{row.reference ?? row.planCode ?? row.id}: {row.status ?? "active"}</li>)}</ul>
        ) : <p>No plans yet.</p>}
      </div>
      <div className="payload-paystack-admin__panel">
        <h2>Subscriptions</h2>
        {subscriptions.length ? (
          <ul>{subscriptions.map((row) => <li key={row.id}>{row.subscriptionCode ?? row.reference ?? row.id}: {row.status ?? "unknown"}</li>)}</ul>
        ) : <p>No subscriptions yet.</p>}
      </div>
      <div className="payload-paystack-admin__panel">
        <h2>Refunds</h2>
        {refunds.length ? (
          <ul>{refunds.map((row) => <li key={row.id}>{row.providerId ?? row.transactionReference ?? row.id}: {row.status ?? "unknown"}</li>)}</ul>
        ) : <p>No refunds yet.</p>}
      </div>
      <div className="payload-paystack-admin__panel">
        <h2>Disputes</h2>
        {disputes.length ? (
          <ul>{disputes.map((row) => <li key={row.id}>{row.providerId ?? row.transactionReference ?? row.id}: {row.status ?? "unknown"}</li>)}</ul>
        ) : <p>No disputes yet.</p>}
      </div>
    </main>
  );
}

export function PaystackAdminNav() {
  return <a href="/admin/paystack-payments">Paystack</a>;
}
