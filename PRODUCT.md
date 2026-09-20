# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: finance- and operations-facing decision-makers at facility owners (warehouses, airports, clinics, and similar enterprises) who must justify or defend an automation budget to an investment committee before buying robotic equipment.

Secondary (confirmed by user): systems integrators and robotics vendors who use the tool to build/validate TCO cases for their own clients.

## Product Purpose

РОБОПОДБОР ("Robot selection/matching") is an independent TCO (total cost of ownership) calculator and catalog for enterprise robotic automation decisions. A user describes a physical site ("объект": warehouse, airport, clinic, etc.) and its processes, and the tool models a multi-year (7-year horizon) CAPEX/OPEX comparison across scenarios (status quo / purchase / RaaS), recommends matching robotic solutions from a catalog, and produces exportable results (PDF/Excel) usable in an internal budget defense or investment-committee presentation.

## Positioning

Vendor-neutral: "Мы не продаём технику и не получаем процент с внедрения" (does not sell hardware and takes no commission on deployments). This independence from equipment vendors is the core differentiator versus vendor- or integrator-run ROI calculators, which a competing product could not truthfully copy without giving up its margin.

## Operating Context

- Core funnel (public, no login required): landing → select object type (`/calculate/:objectType`) → site profile form → process selection → results page with KPIs, scenario comparison, sensitivity analysis, and PDF/Excel export.
- Supporting public pages: methodology (`/methodology`, explains the TCO model: discount rate, CAPEX/OPEX, scenario assumptions), solutions catalog with compare (`/catalog`, `/catalog/compare`), login.
- Authenticated area: dashboard and saved projects (`/projects`) with statuses "Черновик" (draft), "На согласовании" (pending approval), "Защищён" (approved/defended) — reflecting the internal budget-approval workflow the tool is built around.
- Admin area (`role=admin`): catalog/reference-data management (vendor price lists, electricity tariffs, Минпромторг registry data, industry benchmarks).
- Pricing tiers referenced in product copy: "Расчёт" (free calculation), "Экспертиза" (paid, analyst-reviewed), "Группа компаний" (enterprise/multi-site with WMS/ERP integration).

## Capabilities and Constraints

- Frontend: React 19 + Vite + react-router + TanStack Query + Zustand; typed against an OpenAPI contract (`contracts/openapi.yaml`); currently runs against MSW mocks in dev, with a real backend contract ready.
- Includes data-heavy views: charts (recharts), a 3D hero illustration (three.js / @react-three/fiber), PDF/Excel export (jspdf, xlsx).
- Object types (site categories) and process catalogs are structured, enumerable data — design must accommodate a growing catalog list, not a fixed handful of items.
- Terminology is Russian and domain-specific (объект, расчёт, методика, каталог, проекты, источники данных) — redesign must preserve this vocabulary, not translate or genericize it.

## Brand Commitments

Name "РОБОПОДБОР" stays. Per explicit user decision, no other visual constraint is binding — logo mark, color palette, and typography are fully open for the redesign.

## Evidence on Hand

- Product copy in `apps/web/src/features/landing/content.ts` (vendor-neutral positioning, budget-defense narrative, pricing tiers).
- Mock fixtures (`apps/web/src/mocks/fixtures*`) include ~37 historical "внедрений" (deployments, 2021–2026), vendor price lists, tariff data, registry data, and industry benchmarks — treat as realistic placeholder data, not to be presented as unverified real customer claims without confirming with the user first.
- No real customer testimonials, logos, or case-study photography exist yet; any such content in the new design must be clearly placeholder/generic rather than fabricated specific claims.

## Product Principles

1. Independence and vendor-neutrality is the trust signal — design should read as an analyst/consultancy tool, not a sales funnel for hardware.
2. The product's core deliverable is a defensible financial case — clarity, credibility, and scannable numbers matter more than decorative flourish in the calculator/results flow.
3. Serves two audiences (site-owner budget defenders and integrators) — copy and navigation should not assume only one.
4. Russian domain terminology is load-bearing product language, not cosmetic copy.
5. The catalog and object-type lists are open-ended data, not a fixed set — layouts must scale gracefully as entries are added.

## Accessibility & Inclusion

No product-specific requirement established yet.
