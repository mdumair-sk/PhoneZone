# Change Requirement Document (CRD)

**Feature Name:** Commercial Estimate (Non-GST) Integration

**Target Application:** Phone Zone (v1.3)

**Classification:** Functional Engine & Print Layout Enhancement

---

## 1. System Modification Summary

The goal of this change is to implement a professional dual-billing switch at the Point of Sale (POS) counter. This switch will allow the operator to dynamically toggle between generating an official, government-audited **Tax Invoice** and a **Commercial Estimate** (Non-GST document).

When **Commercial Estimate Mode** is selected, all active GST and Margin Scheme calculations are bypassed, the tax lines drop to zero, and the printed output automatically reconfigures its labels and layouts to remain legally compliant.

---

## 2. Database Migration Requirements

To ensure a distinct separation of official tax logs from draft estimations, the application's local database ledger must preserve the document classification type.

### Structural Updates to the `sales` Table

Execute an alter table command to introduce a strict state evaluation column:

* **Column Name:** `invoice_type`
* **Storage Class:** `TEXT`
* **Constraint:** `CHECK(invoice_type IN ('Tax Invoice', 'Estimate'))`
* **Default Value:** `'Tax Invoice'`

### Transaction Validation Mapping

* When a sale is completed with the estimate toggle **inactive**, the row must save as `invoice_type = 'Tax Invoice'`.
* When a sale is completed with the estimate toggle **active**, the row must save as `invoice_type = 'Estimate'`.
* The `cgst_amount` and `sgst_amount` columns inside the `sale_items` table must store exactly `0.00` for all lines committed under an `Estimate` transaction type.

---

## 3. UI Refinements & User Experience Guardrails

### A. Point of Sale (POS) View Layout Extensions

* **The Switch Element:** Place a clean, well-spaced checkbox input inside the "Valuation Metrics" panel on the right sidebar:
`[ ] Commercial Estimate (Non-GST Mode)`
* **On-Screen Math Refresh:** Checking this box must immediately trigger the layout to clear tax displays:
* *Taxable Base Subtotal* changes label to *Subtotal Value*, remaining equal to the gross cart value.
* *Central Tax (CGST)* field updates live to display `₹ 0.00`.
* *State Tax (SGST)* field updates live to display `₹ 0.00`.
* *Final Bill Value (Grand Total)* remains exactly equal to the gross accumulated values of items in the cart.


* **State Loss Protection:** Toggling this checkbox must **never** clear out current customer configuration text fields (Customer Name, Phone Number, etc.) or reset the item array currently held in the cart memory.

### B. Financial Export & Filtering Rules

* **Spreadsheet Compiler Update:** Modify the query logic tied to the **"Download GSTR-1 Excel"** action on the Reports panel.
* **The Filtering Constraint:** Inject a defensive check ensuring that the file builder exclusively pulls rows matching `invoice_type = 'Tax Invoice'`.
* **Omission Guard:** All records stored under `invoice_type = 'Estimate'` must be strictly skipped during the Excel sheet assembly. This ensures that the shop's accountant receives pre-cleaned tax data entirely free of un-audited estimations.

---

## 4. Modified Print Engine & HTML/CSS Layout Map

When triggering a physical printout where the transaction is tagged as an `Estimate`, the app-wide printing stylesheet must apply alternative formatting rules.

### Document Header Structural Swaps

* **Title Container:** The prominent document header text **"TAX INVOICE"** must instantly swap to display **"COMMERCIAL ESTIMATE"** or **"ESTIMATED RECEIPT"**.
* **Identity Erasure:** The store's legal **GSTIN registration code** field must be completely hidden from the header row area.
* **Buyer Data Suppression:** The customer's GSTIN descriptor box must be completely hidden if populated, showing only the Customer Name and contact information.

### Grid & Row Display Parameters

* **Table Lines:** The structural layout columns (S.No, HSN, Item Description, Qty, Rate, Amount) remain visible.
* **Tax Supression:** The per-line tax split indicators (like standard percentages or the *"GST paid under Margin Scheme"* text element) must be entirely suppressed on row items.
* **Footer Totals Box:** The right-hand total card container shifts its text descriptions:
* Change "Taxable Value" label text to read **"Subtotal"**.
* Force printed values for CGST and SGST parameters to explicitly read `0.00`.
* The **GRAND TOTAL** row stays accurate and printed in prominent bold font.



### Lower-Left Legal Disclosures Transformation

* **Bank Box:** Keep the dynamic store bank wire particulars fully visible at the lower boundary, encouraging customer wire settlements.
* **Declaration Block Swap:** The formal statutory *M. GST Act compliance text block* must be entirely removed from the printed layout view. In its place, the system must render the following specific fallback text:
`"This document is a commercial inventory valuation estimate and does not represent an official tax ledger invoice."`

---

## 5. Functional Evaluation Matrix (Core Workflow)

```text
                     [ Checkout Action Initialized ]
                                    │
                                    ▼
                     Inspect Active POS Toggle State
                       /                        \
           [ Toggle Is Checked ]          [ Toggle Is Unchecked ]
                     │                                      │
                     ▼                                      ▼
         Set: invoice_type = 'Estimate'        Set: invoice_type = 'Tax Invoice'
         • Bypass reverse tax algorithms       • Run full calculation engine
         • Write lines tax as 0.00             • Write calculated CGST/SGST lines
         • Exclude from GSTR-1 sheet           • Include in GSTR-1 spreadsheets
         • Render "COMMERCIAL ESTIMATE" A4     • Render formal "TAX INVOICE" A4

```

By separating the execution steps into these two isolated tracks, the change satisfies the store owner's operational workflow requirements without introducing calculations vulnerabilities to their white-market audited data structures.