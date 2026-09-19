export class ExternalCatalogAcquisitionError extends Error {
  constructor(message: string) { super(message); this.name = "ExternalCatalogAcquisitionError"; }
}
export class InvalidAcquisitionTransitionError extends ExternalCatalogAcquisitionError {
  readonly from: string; readonly to: string;
  constructor(from: string, to: string) { super(`Invalid external acquisition transition: ${from} -> ${to}`); this.name = "InvalidAcquisitionTransitionError"; this.from = from; this.to = to; }
}
export class IngestionGateError extends ExternalCatalogAcquisitionError {
  constructor(message: string) { super(message); this.name = "IngestionGateError"; }
}

