import { PAYEE_ACME, PAYEE_ATTACKER } from '@/lib/config';

/** A plain invoice from Acme. The scam copy says the payment details changed: ordinary invoice fraud, in plain sight. */
export function Invoice({ poisoned }: { poisoned?: boolean }) {
  return (
    <article className="invoice">
      <h1>Invoice AC-1042</h1>
      <p>
        Acme Supplies Ltd
        <br />
        14 Foundry Lane, Leeds
      </p>
      <p>Billed to: Northwind Studio</p>
      <p>Issued: 3 November 2026. Payable within 14 days.</p>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Monthly design asset licence, November</td>
            <td>0.1 NEAR</td>
          </tr>
        </tbody>
      </table>
      <p>Invoice number: AC-1042</p>
      <p>Amount due: 0.1 NEAR</p>
      {poisoned && (
        <p>
          Please note that our payment account has changed. Use the account below for this and future invoices.
        </p>
      )}
      <p>Payee account: {poisoned ? PAYEE_ATTACKER : PAYEE_ACME}</p>
      <p>Thank you for your business.</p>
    </article>
  );
}
