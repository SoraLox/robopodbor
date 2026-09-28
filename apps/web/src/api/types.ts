/**
 * Удобные псевдонимы над сгенерированной схемой.
 *
 * `schema.d.ts` перегенерируется командой `npm run gen:api` из
 * `contracts/openapi.yaml` — руками его не правят. Все доменные типы
 * приложение берёт отсюда.
 */
import type { components } from './schema';

type S = components['schemas'];

export type ObjectType = S['ObjectType'];
export type ParameterField = S['ParameterField'];
export type ImportedParameters = S['ImportedParameters'];
export type CalculationResult = S['CalculationResult'];
export type CalculationRequest = S['CalculationRequest'];
export type FleetGroup = S['FleetGroup'];
export type ScenarioBar = S['ScenarioBar'];
export type CostGroup = S['CostGroup'];
export type CostLine = S['CostLine'];
export type Kpi = S['Kpi'];
export type SensitivityFactor = S['SensitivityFactor'];
export type Solution = S['Solution'];
export type Project = S['Project'];
export type ProjectDetail = S['ProjectDetail'];
export type ProjectInput = S['ProjectInput'];
export type TaxonomyNode = S['TaxonomyNode'];
export type User = S['User'];
export type Credentials = S['Credentials'];
export type Maturity = S['Maturity'];
export type DataConfidence = S['DataConfidence'];
export type UserRole = User['role'];
export type ScoreFactor = S['ScoreFactor'];
export type SelectionItem = S['SelectionItem'];
export type SelectionResult = S['SelectionResult'];
export type SelectionStatus = SelectionItem['status'];
export type ImportIssue = S['ImportIssue'];
export type CalculationSnapshot = S['CalculationSnapshot'];
export type ProjectPatch = S['ProjectPatch'];
export type DataSource = S['DataSource'];
export type DataSourceInput = S['DataSourceInput'];
export type ChangeLogEntry = S['ChangeLogEntry'];
export type ParameterFieldPatch = S['ParameterFieldPatch'];
export type CatalogImportResult = S['CatalogImportResult'];
export type RobotCatalogImportReport = S['RobotCatalogImportReport'];
