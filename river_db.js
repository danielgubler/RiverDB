MemoryStorage = {
  _data: {},

  getItem: function(str) {
    return this._data[str];
  },

  setItem: function(str, value) {
    this._data[str] = value;
  }
};

RiverDB = {
  config: {
    storage: MemoryStorage
  }
};

RiverDB.rdbClone = function(obj) {
  let copy;

  // Handle the 3 simple types, and null or undefined
  if (obj == null || typeof obj == "object") { return obj; }

  // Handle Date
  if (obj instanceof Date) {
    copy = new Date();
    copy.setTime(obj.getTime());
    return copy;
  }

  // Handle Array
  if (obj instanceof Array) {
    copy = [];
    for (let i = 0, len = obj.length; i < len; i++) {
      copy[i] = this.rdbClone(obj[i]);
    }
    return copy;
  }

  // Handle Object
  if (obj instanceof Object) {
    copy = {};
    for (let attr in obj) {
      if (obj.hasOwnProperty(attr)) {
        copy[attr] = this.rdbClone(obj[attr]);
      }
    }
    return copy;
  }

  throw new Error("Unable to copy obj! Its type isn't supported.");
};

/**************************************************
 * RiverDB.Collection
 **************************************************/

RiverDB.Collection = class Collection {
  constructor(collectionName, modelName) {
    this.collectionName = collectionName;
    this.modelName = modelName;
  }

  static listen(listener) {
    this.listeners = this.listeners || new Set();
    this.listeners.add(listener);
  }

  getData() {
    let data = JSON.parse(RiverDB.config.storage.getItem(this.collectionName));

    if (!data) {
      data = {};
      RiverDB.config.storage.setItem(this.collectionName, JSON.stringify(data));
    }

    return data;
  }

  getItem(clientId) {
    return this.getData()[clientId];
  }

  setItem(model) {
    let data = this.getData();

    let didExist = data[model.rdbClientId] != null;

    data[model.rdbClientId] = model.rdbAttributes;
    RiverDB.config.storage.setItem(this.collectionName, JSON.stringify(data));

    if (this.constructor.listeners) {
      for (let listener of this.constructor.listeners) {
        let method = this.modelName + (didExist ? "WasUpdated" : "WasAdded");
        if (listener[method]) {
          listener[method](model);
        }
      }
    }
  }

  clearItem(model) {
    let data = this.getData();

    delete data[model.rdbClientId];

    RiverDB.config.storage.setItem(this.collectionName, JSON.stringify(data));

    if (this.constructor.listeners) {
      for (let listener of this.constructor.listeners) {
        let method = this.modelName + "WasDeleted";
        if (listener[method]) {
          listener[method](model);
        }
      }
    }
  }

  clearData() {
    RiverDB.config.storage.setItem(this.collectionName, JSON.stringify({}));

    if (this.constructor.listeners) {
      for (let listener of this.constructor.listeners) {
        let method = this.collectionName + "WereCleared";
        if (listener[method]) {
          listener[method]();
        }
      }
    }
  }
};

/**************************************************
 * RiverDB.Model
 **************************************************/

RiverDB.Model = class Model {
  constructor(attrs) {
    if (new.target === RiverDB.Model) {
      throw new TypeError("RiverDB.Model should not be constructed directly");
    }

    this.rdbAttributes = {};
    this.rdbClientId = RiverDB.Model.generateClientId();

    if (attrs) {
      for (let attr in attrs) {
        this.setAttr(attr, attrs[attr]);
      }
    }
  }

  getAttr(attr) {
    return this.rdbAttributes[attr];
  }

  setAttr(attr, value) {
    this.rdbAttributes[attr] = value;
  }

  get id() {
    return this.getAttr("id");
  }

  static create(modelName, collectionName, init) { // AKA ModelFactory
    let newClass = class extends RiverDB.Model {};
    newClass.rdbModelName = modelName;
    newClass.rdbCollectionName = collectionName;
    newClass.rdbCollection = new RiverDB.Collection(collectionName, modelName);

    init(newClass);

    return newClass;
  }

  static generateClientId() { // todo: should this be here
    return "rdbClientId" + "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      let r = Math.random() * 16 | 0;
      let v = (c == "x") ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  static select(test) {
    let singleSelect = (typeof test == "number" || typeof test == "string");

    if (singleSelect) {
      let id = test;
      test = function(item) { return item.id == id || item.rdbClientId == id; };
    }

    let results = [];

    let collectionData = this.rdbCollection.getData();
    for (let clientId in collectionData) {
      let item = new this();
      item.parseAttributes(collectionData[clientId]);
      item.rdbClientId = clientId;
      if (test == null || test(item)) {
        if (singleSelect) { return item; }
        results.push(item);
      }
    }

    return results;
  }

  static clear(test) {
    if (!test) {
      this.rdbCollection.clearData();
      return;
    }

    let singleSelect = (typeof test == "number" || typeof test == "string");

    if (singleSelect) {
      let id = test;
      test = function(item) { return item.id == id || item.rdbClientId == id; };
    }

    let collectionData = this.rdbCollection.getData();
    for (let clientId in collectionData) {
      let item = new this();
      item.parseAttributes(collectionData[clientId]);
      item.rdbClientId = clientId;
      if (test(item)) {
        this.rdbCollection.clearItem(item);
        if (singleSelect) { return; }
      }
    }
  }

  static hasProperty(name, options) {
    if (this.prototype.hasOwnProperty(name)) { return; }

    options = options || {};

    Object.defineProperty(this.prototype, name, {
      get: function() {
        if (options.get) { return options.get.call(this); }
        return this.getAttr(name);
      },
      set: function(newValue) {
        if (options.readOnly) { return; }
        // todo: implement validators
        this.setAttr(name, newValue);
      }
    });
  }

  // todo: polymorphic relationships
  // todo: apparently can't use model names as globals aren't hoisted
  static hasMany(model) {
    let thisModel = this;
    this.prototype[model.rdbCollectionName] = function() {
      return model.selectAll((item) => item[thisModel.rdbModelName + "Id"] == this.id);
    };
  }

  static hasOne(model) { // todo: wrap head around hasOne/belongsTo
    let thisModel = this;
    this.prototype[model.rdbModelName] = function() {
      return model.select((item) => item[thisModel.rdbModelName + "Id"] == this.id);
    };
  }

  static belongsTo(model) {
    this.prototype[model.rdbModelName] = function() {
      return model.select(this[model.rdbModelName + "Id"]);
    };
  }

  static listen(listener) {
    this.rdbCollection.listen(listener);
  }

  listen(listener) {
    this.rdbListeners = this.rdbListeners || new Set();
    this.rdbListeners.add(listener);
  }

  static addSerializer(name, serializer) {
    this.rdbSerializers = this.rdbSerializers || {};
    this.rdbSerializers[name] = serializer;
  }

  static addDeserializer(name, deserializer) {
    this.rdbDeserializers = this.rdbDeserializers || {};
    this.rdbDeserializers[name] = deserializer;
  }

  static deserialize(data) { // todo: should we have both class and instance deserialize?
    let deserializer = this.rdbDeserializers[name];
    let newModel = new this();
    deserializer(newModel, data);
    return newModel;
  }

  deserialize(name, data) {
    let deserializer = this.constructor.rdbDeserializers[name];
    deserializer(this, data);
  }

  serialize(name) {
    let serializer = this.constructor.rdbSerializers[name];
    return serializer(this);
  }

  parseAttributes(attrs) {
    this.rdbAttributes = RiverDB.rdbClone(attrs);
  }

  reload() {
    this.parseAttributes(this.constructor.rdbCollection.getItem(this.rdbClientId));
  }

  save() {
    // TODO: rather than replacing the object outright, set each attribute,
    // so if the new model is missing attributes, the old model's attrs will be kept
    this.constructor.rdbCollection.setItem(this);

    // todo: should we even have per-model listeners?
    if (this.rdbListeners) {
      for (let listener of this.rdbListeners) {
        let method = this.constructor.rdbModelName + "WasUpdated";
        if (listener[method]) {
          listener[method](this);
        }
      }
    }
  }

  delete() {
    this.constructor.rdbCollection.clearItem(this);
  }
};
