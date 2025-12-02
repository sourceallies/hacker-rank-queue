/* eslint-disable @typescript-eslint/no-explicit-any */
export class GoogleSpreadsheet {
  sheetsByTitle: Record<string, any> = {};
  loadInfo = jest.fn();
  addSheet = jest.fn();

  constructor(
    public spreadsheetId: string,
    public auth?: any,
  ) {}
}

export class GoogleSpreadsheetWorksheet {
  title?: string;
  setHeaderRow = jest.fn();
  getRows = jest.fn();
  addRow = jest.fn();

  constructor() {}
}

export class GoogleSpreadsheetRow {
  private data: Record<string, any> = {};

  get(key: string): any {
    return this.data[key];
  }

  set(key: string, value: any): void {
    this.data[key] = value;
  }

  save = jest.fn();
  delete = jest.fn();

  // Helper method for tests to set data
  _setData(data: Record<string, any>): void {
    this.data = data;
  }
}
