import Database from 'better-sqlite3';
import { ForeignKeyData, Tables } from './constants/tables';

export const TheMerger = () => {
  const mainDb = new Database(__dirname + '/db/main/main.db');
  const toMerge = new Database(__dirname + '/db/secondary/secondary.db');

  const getTableColumns = (tableName: string): string => {
    const tableColumns = mainDb
      .prepare(`PRAGMA table_info(${tableName});`)
      .all();

    return tableColumns
      .map((t) => (t.pk === 1 ? 'NULL' : '@' + t.name))
      .join(', ');
  };

  const simpleTableMerge = (tableName: string) => {
    const tableInsert = mainDb.prepare(
      `INSERT INTO ${tableName} VALUES (${getTableColumns(tableName)});`
    );
    const tableRows: any[] = toMerge
      .prepare(`SELECT * FROM ${tableName};`)
      .all();
    for (const tableRow of tableRows) {
      try {
        tableInsert.run(tableRow);
      } catch {}
    }
  };

  const getObjCondition = (obj: any, exludedKeys: string[]) => {
    const keys = Object.keys(obj);
    const condition = keys
      .filter((key) => !exludedKeys.includes(key))
      .map((key) => `${key} IS ${obj[key] !== null ? `'${obj[key]}'` : null}`)
      .join(' AND ');

    return condition;
  };

  const complexTableMerge = (
    tableName: string,
    foreignKeysData: {
      table: string;
      key: string;
    }[]
  ) => {
    const tableInsert = mainDb.prepare(
      `INSERT INTO ${tableName} VALUES (${getTableColumns(tableName)});`
    );

    const tableRows: any[] = toMerge
      .prepare(`SELECT * FROM ${tableName};`)
      .all();
    for (const tableRow of tableRows) {
      try {
        foreignKeysData.forEach((foreignKeyData) => {
          const findInsert = toMerge
            .prepare(
              `SELECT * FROM ${foreignKeyData.table} WHERE ${
                foreignKeyData.table + 'Id'
              } = ${tableRow[foreignKeyData.key]};`
            )
            .get();

          const findInMain = mainDb.prepare(
            `SELECT ${foreignKeyData.table + 'Id'} FROM ${
              foreignKeyData.table
            } WHERE ${getObjCondition(findInsert, [
              foreignKeyData.table + 'Id',
            ])}`
          );

          tableRow[foreignKeyData.key] =
            findInMain.get()![foreignKeyData.table + 'Id'];
        });

        tableInsert.run(tableRow);
      } catch {}
    }
  };

  const getForeignKeys = (tableName: string): ForeignKeyData[] => {
    const foreignKeys = mainDb
      .prepare(`SELECT * FROM pragma_foreign_key_list('${tableName}');`)
      .all();

    return foreignKeys;
  };

  const findCorresponding = (tableName: string, tableRow: any) => {
    for (const foreignKey of getForeignKeys(tableName)) {
      if (tableRow[foreignKey.from] !== null) {
        let currentTableRow = toMerge
          .prepare(
            `SELECT * FROM ${foreignKey.table} WHERE ${
              foreignKey.table + 'Id'
            } = ${tableRow[foreignKey.from]};`
          )
          .get();

        const deeperForeignKeys = getForeignKeys(foreignKey.table);
        if (deeperForeignKeys.length > 0)
          currentTableRow = findCorresponding(
            foreignKey.table,
            currentTableRow
          );

        const findInMain = mainDb
          .prepare(
            `SELECT ${foreignKey.table + 'Id'} FROM ${
              foreignKey.table
            } WHERE ${getObjCondition(currentTableRow, [
              foreignKey.table + 'Id',
            ])}`
          )
          .get();

        tableRow[foreignKey.to] = findInMain[foreignKey.table + 'Id'];
      }
    }

    return tableRow;
  };

  const deepComplexTableMerge = (tableName: string) => {
    const tableInsert = mainDb.prepare(
      `INSERT INTO ${tableName} VALUES (${getTableColumns(tableName)});`
    );

    const tableRows: any[] = toMerge
      .prepare(`SELECT * FROM ${tableName};`)
      .all();
    for (const tableRow of tableRows) {
      try {
        const corresponding = findCorresponding(tableName, tableRow);
        tableInsert.run(corresponding);
      } catch {}
    }
  };

  const mergeDatabases = () => {
    const startTime = Date.now();
    console.log('Starting merge...');
    simpleTableMerge(Tables.Tag);
    simpleTableMerge(Tables.Location);

    complexTableMerge(Tables.Bookmark, [
      {
        key: 'LocationId',
        table: Tables.Location,
      },
      {
        key: 'PublicationLocationId',
        table: Tables.Location,
      },
    ]);
    complexTableMerge(Tables.InputField, [
      {
        key: 'LocationId',
        table: Tables.Location,
      },
    ]);
    complexTableMerge(Tables.UserMark, [
      {
        key: 'LocationId',
        table: Tables.Location,
      },
    ]);

    deepComplexTableMerge(Tables.BlockRange);
    deepComplexTableMerge(Tables.Note);
    deepComplexTableMerge(Tables.TagMap);

    console.log(`Merge finished in ${(Date.now() - startTime) / 1000} seconds`);
  };

  mergeDatabases();
  mainDb.close();
  toMerge.close();
};
