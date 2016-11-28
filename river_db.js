MemoryStorage = {
  _data: {},

  getItem: function(str) {
    return this._data[str]
  },

  setItem: function(str, value) {
    this._data[str] = value
  }
}

RiverDB = {
  config: {
    storage: MemoryStorage
  },

  modelNameMap: {}
}

RiverDB.rdbClone = function(obj) {
  let copy

  // Handle the 3 simple types, and null or undefined
  if (obj == null || typeof obj == "object") { return obj }

  // Handle Date
  if (obj instanceof Date) {
    copy = new Date()
    copy.setTime(obj.getTime())
    return copy
  }

  // Handle Array
  if (obj instanceof Array) {
    copy = []
    for (let i = 0, len = obj.length; i < len; i++) {
      copy[i] = this.rdbClone(obj[i])
    }
    return copy
  }

  // Handle Object
  if (obj instanceof Object) {
    copy = {}
    for (let attr in obj) {
      if (obj.hasOwnProperty(attr)) {
        copy[attr] = this.rdbClone(obj[attr])
      }
    }
    return copy
  }

  throw new Error("Unable to copy obj! Its type isn't supported.")
}

/**************************************************
 * RiverDB.Collection
 **************************************************/

RiverDB.Collection = class Collection {
  constructor(collectionName, modelName) {
    this.collectionName = collectionName
    this.modelName = modelName
  }

  listen(listener) {
    this.listeners = this.listeners || new Set()
    this.listeners.add(listener)
  }

  getData() {
    if (this._data) {
      return this._data
    }

    let jsonString = RiverDB.config.storage.getItem(this.collectionName)

    let storedData = jsonString ? JSON.parse(jsonString) : null

    if (!storedData) {
      storedData = {}

      RiverDB.config.storage.setItem(this.collectionName, "{}")
    }

    this._data = storedData

    return this._data
  }

  getItem(clientId) {
    return this.getData()[clientId]
  }

  setItem(model) {
    let data = this.getData()

    let didExist = data[model.rdbClientId] != null

    data[model.rdbClientId] = model.rdbAttributes
    RiverDB.config.storage.setItem(this.collectionName, JSON.stringify(data))

    if (this.constructor.listeners) {
      for (let listener of this.constructor.listeners) {
        let method = this.modelName + (didExist ? "WasUpdated" : "WasAdded")
        if (listener[method]) {
          listener[method](model)
        }
      }
    }
  }

  clearItem(model) {
    let data = this.getData()

    delete data[model.rdbClientId]

    RiverDB.config.storage.setItem(this.collectionName, JSON.stringify(data))

    if (this.constructor.listeners) {
      for (let listener of this.constructor.listeners) {
        let method = this.modelName + "WasDeleted"
        if (listener[method]) {
          listener[method](model)
        }
      }
    }
  }

  clearData() {
    RiverDB.config.storage.setItem(this.collectionName, JSON.stringify({}))

    if (this.constructor.listeners) {
      for (let listener of this.constructor.listeners) {
        let method = this.collectionName + "WereCleared"
        if (listener[method]) {
          listener[method]()
        }
      }
    }
  }
}

/**************************************************
 * RiverDB.Model
 **************************************************/

RiverDB.Model = class Model {
  constructor(attrs) {
    if (new.target === RiverDB.Model) {
      throw new TypeError("RiverDB.Model should not be constructed directly")
    }

    if (!(this.constructor.rdbModelName && this.constructor.rdbCollectionName)) {
      throw new Error("Attempt to instantiate unnamed RiverDB model")
    }

    if (!this.constructor.finalized) {
      this.constructor.finalize()
    }

    this.rdbAttributes = {}
    this.rdbClientId = this.constructor._generateClientId()

    if (attrs) {
      for (let attr in attrs) {
        this.set(attr, attrs[attr])
      }
    }
  }

  // initializes properties, relationships, collection, etc.
  static finalize() {
    if (this.finalized) { return }

    RiverDB.modelNameMap[this.rdbModelName] = this

    for (let property in this.rdbProperties) {
      this._definePropertyAccessor(property, this.rdbProperties[property])
    }

    for (let relationship of this.rdbRelationships) {
      switch (relationship.type) {
      case "hasMany":
        this._defineHasManyRelationship(relationship)
        break
      case "hasOne":
        this._defineHasOneRelationship(relationship)
        break
      case "belongsTo":
        this._defineBelongsToRelationship(relationship)
        break
      }
    }

    this.finalized = true
  }

  get(attr) {
    return this.rdbAttributes[attr]
  }

  set(attr, value) {
    this.rdbAttributes[attr] = value
  }

  get id() {
    return this.get("id")
  }

  static _generateClientId() {
    if (this.rdbLastClientId == null) { this.rdbLastClientId = 0 }
    this.rdbLastClientId += 1
    return `rdb-${this.rdbModelName}-${this.rdbLastClientId}`
  }

  static _definePropertyAccessor(name, options) {
    if (this.prototype.hasOwnProperty(name)) { return }

    Object.defineProperty(this.prototype, name, {
      get: function() {
        if (options.get) { return options.get.call(this) }
        return this.get(name)
      },
      set: function(newValue) {
        if (options.readOnly) { return }
        // todo: implement validators
        if (options.set) {
          options.set.call(this, newValue)
        } else {
          this.set(name, newValue)
        }
      }
    })
  }

  static _defineHasManyRelationship(options) {
    if (!(options && options.target)) { return }

    this.prototype[options.target.rdbCollectionName] = function() {
      let thisModelName = this.constructor.rdbModelName

      return options.target.where((targetModel) => {
        if (options.inverse) { // inverse polymorphic
          if (targetModel.get(`${options.inverse}Type`) == thisModelName && targetModel.get(`${options.inverse}Id`) == this.id) {
            return (!options.where || options.where(targetModel))
          }
        } else {
          if (targetModel.get(`${thisModelName}Id`) == this.id) {
            return (!options.where || options.where(targetModel))
          }
        }
      })
    }
  }

  static _defineHasOneRelationship(options) {
    if (!(options && options.target)) { return }

    this.prototype[options.target.rdbModelName] = function() {
      let thisModelName = this.constructor.rdbModelName

      return options.target.select((targetModel) => {
        if (options.inverse) { // inverse polymorphic
          if (targetModel.get(`${options.inverse}Type`) == thisModelName && targetModel.get(`${options.inverse}Id`) == this.id) {
            return (!options.where || options.where(targetModel))
          }
        } else {
          if (targetModel.get(`${thisModelName}Id`) == this.id) {
            return (!options.where || options.where(targetModel))
          }
        }
      })
    }
  }

  static _defineBelongsToRelationship(options) {
    if (!(options && options.target)) { return }

    let targetModelName = options.polymorphic ? options.target : options.target.rdbModelName

    this.prototype[targetModelName] = function() {
      let targetModelId = this.get(`${targetModelName}Id`)
      let targetModel = options.target

      if (options.polymorphic) {
        targetModel = RiverDB.modelNameMap[this.get(`${targetModelName}Type`)]
      }

      return targetModel.select((model) => {
        if (model.id == targetModelId) {
          return (!options.where || options.where(model))
        }
      })
    }
  }

  static get rdbCollection() {
    if (this._rdbCollection) {
      return this._rdbCollection
    }

    this._rdbCollection = new RiverDB.Collection(this.rdbCollectionName, this.rdbModelName)

    return this._rdbCollection
  }

  static selectAll() {
    let results = []

    let collectionData = this.rdbCollection.getData()

    for (let clientId in collectionData) {
      let item = new this()
      item.parseAttributes(collectionData[clientId])
      item.rdbClientId = clientId
      results.push(item)
    }

    return results
  }

  static select(test) {
    if (test == null) { return }

    if (typeof test == "string" || typeof test == "number") {
      let id = test
      test = function(model) { return model.id == id || model.clientId == id }
    }

    let collectionData = this.rdbCollection.getData()

    for (let clientId in collectionData) {
      let item = new this()
      item.parseAttributes(collectionData[clientId])
      item.rdbClientId = clientId
      if (test(item)) {
        return item
      }
    }
  }

  static where(test) {
    if (test == null) { return }

    let results = []

    let collectionData = this.rdbCollection.getData()

    for (let clientId in collectionData) {
      let item = new this()
      item.parseAttributes(collectionData[clientId])
      item.rdbClientId = clientId
      if (test(item)) {
        results.push(item)
      }
    }

    return results
  }

  static clearAll() {
    this.rdbCollection.clearData()
  }

  static listen(listener) {
    this.rdbCollection.listen(listener)
  }

  listen(listener) {
    this.rdbListeners = this.rdbListeners || new Set()
    this.rdbListeners.add(listener)
  }

  static addSerializer(name, serializer) {
    this.rdbSerializers = this.rdbSerializers || {}
    this.rdbSerializers[name] = serializer
  }

  static addDeserializer(name, deserializer) {
    this.rdbDeserializers = this.rdbDeserializers || {}
    this.rdbDeserializers[name] = deserializer
  }

  static deserialize(data) { // todo: should we have both class and instance deserialize?
    let deserializer = this.rdbDeserializers[name]
    let newModel = new this()
    deserializer(newModel, data)
    return newModel
  }

  deserialize(name, data) {
    let deserializer = this.constructor.rdbDeserializers[name]
    deserializer(this, data)
  }

  serialize(name) {
    let serializer = this.constructor.rdbSerializers[name]
    return serializer(this)
  }

  parseAttributes(attrs) {
    this.rdbAttributes = RiverDB.rdbClone(attrs)
  }

  reload() {
    this.parseAttributes(this.constructor.rdbCollection.getItem(this.rdbClientId))
  }

  save() {
    // TODO: rather than replacing the object outright, set each attribute,
    // so if the new model is missing attributes, the old model's attrs will be kept
    this.constructor.rdbCollection.setItem(this)

    // todo: should we even have per-model listeners?
    if (this.rdbListeners) {
      for (let listener of this.rdbListeners) {
        let method = this.constructor.rdbModelName + "WasUpdated"
        if (listener[method]) {
          listener[method](this)
        }
      }
    }
  }

  delete() {
    this.constructor.rdbCollection.clearItem(this)
  }
}
