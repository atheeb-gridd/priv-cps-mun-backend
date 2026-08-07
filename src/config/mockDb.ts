import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(__dirname, '../../db.json');

let cachedDb: Record<string, any[]> | null = null;

const readDb = (): Record<string, any[]> => {
  if (!fs.existsSync(DB_FILE)) {
    cachedDb = { users: [], registrations: [], pendingusers: [], otps: [], drafts: [], settings: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(cachedDb, null, 2), 'utf-8');
    return cachedDb;
  }
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    cachedDb = data;
    return cachedDb!;
  } catch {
    if (!cachedDb) {
      cachedDb = { users: [], registrations: [], pendingusers: [], otps: [], drafts: [], settings: [] };
    }
    return cachedDb!;
  }
};

const writeDb = (data: Record<string, any[]>) => {
  try {
    if (fs.existsSync(DB_FILE)) {
      const diskData = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      if (diskData && Array.isArray(diskData.settings)) {
        data.settings = diskData.settings;
      }
    }
  } catch (e) {}

  cachedDb = data;
  const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }
};

const getNestedValue = (obj: any, path: string) => {
  if (!obj || typeof obj !== 'object') return undefined;
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined) ? acc[part] : undefined, obj);
};

const matchQuery = (item: any, query: any): boolean => {
  return Object.entries(query).every(([key, val]) => {
    if (key === '$or' && Array.isArray(val)) {
      return val.some((subQuery: any) => matchQuery(item, subQuery));
    }
    const itemVal = getNestedValue(item, key);
    if (itemVal === undefined || itemVal === null) return false;

    // Handle comparison operators ($gt, $lt, $gte, $lte)
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.entries(val).every(([op, opVal]: [string, any]) => {
        const itemTime = typeof itemVal === 'string' && !isNaN(Date.parse(itemVal)) ? Date.parse(itemVal) : null;
        const opTime = typeof opVal === 'string' && !isNaN(Date.parse(opVal)) ? Date.parse(opVal) : (opVal instanceof Date ? opVal.getTime() : null);

        if (op === '$gt') {
          if (itemTime && opTime) return itemTime > opTime;
          return itemVal > opVal;
        }
        if (op === '$lt') {
          if (itemTime && opTime) return itemTime < opTime;
          return itemVal < opVal;
        }
        if (op === '$gte') {
          if (itemTime && opTime) return itemTime >= opTime;
          return itemVal >= opVal;
        }
        if (op === '$lte') {
          if (itemTime && opTime) return itemTime <= opTime;
          return itemVal <= opVal;
        }
        if (op === '$ne') {
          return itemVal !== opVal;
        }
        if (op === '$nin' && Array.isArray(opVal)) {
          return !opVal.includes(itemVal);
        }
        if (op === '$in' && Array.isArray(opVal)) {
          return opVal.includes(itemVal);
        }
        return false;
      });
    }

    return itemVal.toString().toLowerCase() === (val || '').toString().toLowerCase();
  });
};

class MockDocument {
  [key: string]: any;
  constructor(data: any, collectionName: string) {
    Object.assign(this, data);
    this._collectionName = collectionName;
    if (!this._id) {
      this._id = 'mock_' + Math.random().toString(36).substring(2, 9);
    }
    if (!this.createdAt) this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  markModified(path: string) {
    // No-op for mock DB document
  }

  async save() {
    const db = readDb();
    const collectionName = this._collectionName;
    if (!db[collectionName]) {
      db[collectionName] = [];
    }
    const index = db[collectionName].findIndex((item: any) => {
      if (this._id && item._id && String(this._id).trim() !== '' && item._id === this._id) return true;
      if (this.registrationId && String(this.registrationId).trim() !== '' && item.registrationId === this.registrationId) return true;
      if (this.userId && String(this.userId).trim() !== '' && item.userId === this.userId) return true;
      return false;
    });
    if (index !== -1) {
      db[collectionName][index] = { ...this };
    } else {
      db[collectionName].push({ ...this });
    }
    writeDb(db);
    return this;
  }
}

export class MockModelClass {
  collectionName: string;
  DocClass: any;

  constructor(collectionName: string) {
    this.collectionName = collectionName.toLowerCase() + 's';
    const collName = this.collectionName;
    this.DocClass = class extends MockDocument {
      constructor(data: any) {
        super(data, collName);
      }
    };
  }

  createDoc(data: any) {
    return new this.DocClass(data);
  }

  findOne(query: any) {
    const db = readDb();
    const items = db[this.collectionName] || [];
    const matched = items.find((item: any) => matchQuery(item, query));
    const doc = matched ? new this.DocClass(matched) : null;

    const promise: any = Promise.resolve(doc);
    promise.select = function(fields: string) {
      return promise;
    };
    promise.populate = function(path: string, selectFields?: string) {
      if (doc && path === 'user') {
        const users = db['users'] || [];
        const userDoc = users.find((u: any) => u.userId === doc.userId);
        if (userDoc) {
          doc.user = userDoc;
        }
      }
      return promise;
    };
    return promise;
  }

  find(query: any = {}) {
    const db = readDb();
    const items = db[this.collectionName] || [];
    const matched = items.filter((item: any) => matchQuery(item, query));
    let docs = matched.map((item: any) => new this.DocClass(item));

    const promise: any = Promise.resolve(docs);
    promise.select = function(fields: string) {
      return promise;
    };
    promise.sort = function(sortObj: any) {
      if (sortObj && typeof sortObj === 'object') {
        const field = Object.keys(sortObj)[0];
        const dir = sortObj[field];
        if (field) {
          docs.sort((a: any, b: any) => {
            let valA = a[field] ?? '';
            let valB = b[field] ?? '';
            if (valA < valB) return dir === -1 ? 1 : -1;
            if (valA > valB) return dir === -1 ? -1 : 1;
            return 0;
          });
        }
      }
      return promise;
    };
    promise.populate = function(path: string, selectFields?: string) {
      if (path === 'user') {
        const users = db['users'] || [];
        docs.forEach((doc: any) => {
          const userDoc = users.find((u: any) => u.userId === doc.userId);
          if (userDoc) {
            doc.user = userDoc;
          }
        });
      }
      return promise;
    };
    return promise;
  }

  findById(id: string) {
    const db = readDb();
    const items = db[this.collectionName] || [];
    const matched = items.find((item: any) => item._id === id);
    const doc = matched ? new this.DocClass(matched) : null;

    const promise: any = Promise.resolve(doc);
    promise.select = function(fields: string) {
      return promise;
    };
    promise.populate = function(path: string, selectFields?: string) {
      if (doc && path === 'user') {
        const users = db['users'] || [];
        const userDoc = users.find((u: any) => u.userId === doc.userId);
        if (userDoc) {
          doc.user = userDoc;
        }
      }
      return promise;
    };
    return promise;
  }

  async deleteOne(query: any) {
    const db = readDb();
    const items = db[this.collectionName] || [];
    const index = items.findIndex((item: any) => matchQuery(item, query));
    if (index !== -1) {
      items.splice(index, 1);
      db[this.collectionName] = items;
      writeDb(db);
    }
    return { deletedCount: index !== -1 ? 1 : 0 };
  }

  async deleteMany(query: any = {}) {
    const db = readDb();
    const items = db[this.collectionName] || [];
    let initialCount = items.length;
    let remainingItems = items;
    if (!query || Object.keys(query).length === 0) {
      remainingItems = [];
    } else {
      remainingItems = items.filter((item: any) => !matchQuery(item, query));
    }
    db[this.collectionName] = remainingItems;
    writeDb(db);
    return { deletedCount: initialCount - remainingItems.length };
  }

  async findOneAndUpdate(query: any, update: any, options: any = {}) {
    const db = readDb();
    const items = db[this.collectionName] || [];
    let index = items.findIndex((item: any) => matchQuery(item, query));

    let doc: any;
    if (index !== -1) {
      doc = { ...items[index], ...update };
      items[index] = doc;
    } else if (options.upsert) {
      doc = { ...query, ...update };
      if (!doc._id) {
        doc._id = 'mock_' + Math.random().toString(36).substring(2, 9);
      }
      if (!doc.createdAt) doc.createdAt = new Date().toISOString();
      doc.updatedAt = new Date().toISOString();
      items.push(doc);
    } else {
      return null;
    }

    db[this.collectionName] = items;
    writeDb(db);
    return new this.DocClass(doc);
  }

  async findByIdAndDelete(id: string) {
    const db = readDb();
    const items = db[this.collectionName] || [];
    const index = items.findIndex((item: any) => item._id === id || item.id === id);
    let deletedDoc = null;
    if (index !== -1) {
      deletedDoc = items[index];
      items.splice(index, 1);
      db[this.collectionName] = items;
      writeDb(db);
    }
    return deletedDoc ? new this.DocClass(deletedDoc) : null;
  }

  async findByIdAndUpdate(id: string, update: any, options: any = {}) {
    return this.findOneAndUpdate({ _id: id }, update, options);
  }

  async findOneAndDelete(query: any) {
    const db = readDb();
    const items = db[this.collectionName] || [];
    const index = items.findIndex((item: any) => matchQuery(item, query));
    let deletedDoc = null;
    if (index !== -1) {
      deletedDoc = items[index];
      items.splice(index, 1);
      db[this.collectionName] = items;
      writeDb(db);
    }
    return deletedDoc ? new this.DocClass(deletedDoc) : null;
  }

  async countDocuments(query: any = {}) {
    const db = readDb();
    const items = db[this.collectionName] || [];
    const matched = items.filter((item: any) => matchQuery(item, query));
    return matched.length;
  }

  async updateMany(query: any = {}, update: any = {}) {
    const db = readDb();
    const items = db[this.collectionName] || [];
    let updatedCount = 0;
    const updateObj = update.$set || update;
    items.forEach((item: any) => {
      if (matchQuery(item, query)) {
        Object.assign(item, updateObj);
        updatedCount++;
      }
    });
    db[this.collectionName] = items;
    writeDb(db);
    return { modifiedCount: updatedCount };
  }
}

export function createMockModel(name: string) {
  const mockInstance = new MockModelClass(name);
  
  function ModelConstructor(this: any, data: any) {
    if (!(this instanceof ModelConstructor)) {
      return mockInstance.createDoc(data);
    }
    return mockInstance.createDoc(data);
  }
  
  Object.setPrototypeOf(ModelConstructor, {
    findOne: mockInstance.findOne.bind(mockInstance),
    find: mockInstance.find.bind(mockInstance),
    findById: mockInstance.findById.bind(mockInstance),
    findByIdAndDelete: mockInstance.findByIdAndDelete.bind(mockInstance),
    findByIdAndUpdate: mockInstance.findByIdAndUpdate.bind(mockInstance),
    findOneAndDelete: mockInstance.findOneAndDelete.bind(mockInstance),
    deleteOne: mockInstance.deleteOne.bind(mockInstance),
    deleteMany: mockInstance.deleteMany.bind(mockInstance),
    updateMany: mockInstance.updateMany.bind(mockInstance),
    findOneAndUpdate: mockInstance.findOneAndUpdate.bind(mockInstance),
    countDocuments: mockInstance.countDocuments.bind(mockInstance),
  });
  
  return ModelConstructor as any;
}

export function isMockDB(): boolean {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri === 'mock' || uri.includes('<db_password>') || uri.includes('<password>')) {
    return true;
  }
  return false;
}

