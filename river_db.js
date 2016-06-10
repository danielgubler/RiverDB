MemoryStorage = {
  _data: { },

  setItem: function(str, value) {
    this._data[str] = value
  },

  getItem: function(str) {
    return this._data[str]
  }
}

/**************************************************
 * RiverDB.Model
 **************************************************/

RiverDB = {
  collections: { },
  models: { },
  config: {
    storage: MemoryStorage
  },
  _listeners: { }
}

RiverDB._listenersFor = function(collectionName, clientId) {
  this._listeners[collectionName] = this._listeners[collectionName] || { }
  this._listeners[collectionName][clientId] = this._listeners[collectionName][clientId] || []
  return this._listeners[collectionName][clientId]
}

RiverDB.listen = function(collectionName, clientId, obj) {
  var listeners = this._listenersFor(collectionName, clientId)
  if (listeners.indexOf(obj) == -1) { listeners.push(obj) }
}

RiverDB.stopListening = function(collectionName, clientId, obj) {
  var listeners = this._listenersFor(collectionName, clientId)
  var index = listeners.indexOf(obj)
  if (index != -1) { listeners.splice(index, 1) }
}

RiverDB.Model = function() {
  this.rdbClientId = null
  this.rdbAttributes = { }
  this.rdbListeners = []
}

RiverDB.rdbClone = function (obj) {
  var copy

  // Handle the 3 simple types, and null or undefined
  if (obj == null || typeof obj == 'object') { return obj }

  // Handle Date
  if (obj instanceof Date) {
    copy = new Date()
    copy.setTime(obj.getTime())
    return copy
  }

  // Handle Array
  if (obj instanceof Array) {
    copy = []
    for (var i = 0, len = obj.length; i < len; i++) {
      copy[i] = this.rdbClone(obj[i])
    }
    return copy
  }

  // Handle Object
  if (obj instanceof Object) {
    copy = {}
    for (var attr in obj) {
      if (obj.hasOwnProperty(attr)) copy[attr] = this.rdbClone(obj[attr])
    }
    return copy
  }

  throw new Error("Unable to copy obj! Its type isn't supported.")
}

RiverDB.save = function(obj) {
  this.collections[obj.rdbCollectionName].setItem(obj)
  var listeners = this._listenersFor(obj.rdbCollectionName, obj.rdbClientId)
  listeners.forEach(function(listener) {
    listener.modelWasUpdated()
  })
}

/**************************************************
 * RiverDB.Model class methods
 **************************************************/

RiverDB.Model.generateClientId = function() {
  return 'rdbClientId' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8)
    return v.toString(16)
  })
}

RiverDB.Collection = function(collectionName = null, modelName = null) {
  this.modelName = modelName
  this.collectionName = collectionName

  this.setItem = function(dataModel) {
    var data = this.getData()
    data[dataModel.rdbClientId] = dataModel.rdbAttributes
    RiverDB.config.storage.setItem(this.collectionName, JSON.stringify(data))
  }

  this.clearItem = function(dataModel) {
    var data = this.getData()
    data[dataModel.rdbClientId] = dataModel.rdbAttributes
    RiverDB.config.storage.removeItem(this.collectionName)
  }

  this.clearData = function() {
    RiverDB.config.storage.setItem(this.collectionName, JSON.stringify({ }))
  }

  this.getItem = function(clientId) {
    return this.getData()[clientId]
  }

  this.getData = function() {
    var data = JSON.parse(RiverDB.config.storage.getItem(this.collectionName))
    if (!data) {
      data = { }
      RiverDB.config.storage.setItem(this.collectionName, JSON.stringify(data))
    }

    return data
  }
}

RiverDB.Model.create = function(modelName, collectionName, init) {
  RiverDB.models[modelName] = function(attrs) {
    RiverDB.Model.call(this)
    this.rdbClientId = RiverDB.Model.generateClientId()
    this.rdbModelName = modelName
    this.rdbCollectionName = collectionName

    if (attrs) {
      for (var attr in attrs) {
        this.set(attr, attrs[attr])
      }
    }
  }

  var model = RiverDB.models[modelName]
  model.rdbModelName = modelName
  model.rdbCollectionName = collectionName

  model.prototype = Object.create(RiverDB.Model.prototype)
  model.prototype.constructor = model

  model.select = function(test) { return RiverDB.Model.select(modelName, test) }
  model.selectAll = function() { return RiverDB.Model.selectAll(modelName) }
  model.clear = function(test) { return RiverDB.Model.clear(modelName, test) }
  model.clearAll = function() { return RiverDB.Model.clearAll(modelName) }
  model.where = function(test) { return RiverDB.Model.where(modelName, test) }

  model.hasOne = function(options) {
    if ((typeof options) == 'string') { options = { name: options } }

    model.fields = model.fields || { }
    model.fields[options.name] = options

    var inverse = options.inverse || modelName
    var parentModel = options.model || options.name

    model.prototype[options.name] = function() {
      var self = this
      var association = RiverDB.models[parentModel]
      var inversePolymorphic = false
      try { inversePolymorphic = association.fields[inverse].polymorphic } catch (e) { }

      return association.select(function(child) {
        if (inversePolymorphic && child.get(inverse + 'Type') != self.rdbModelName) { return false }
        var childParentId = child.get(inverse + 'Id')
        if (!childParentId) { return false }
        var withinScope = !options.where || options.where(child)
        if (typeof childParentId == 'string' && childParentId.startsWith('rdbClientId')) {
          return childParentId == self.rdbClientId && withinScope
        } else {
          return childParentId == self.id && withinScope
        }
      })
    }
  }

  model.hasMany = function(options) {
    if ((typeof options) == 'string') { options = { name: options } }

    model.fields = model.fields || { }
    model.fields[options.name] = options

    var inverse = options.inverse || modelName

    model.prototype[options.name] = function() {
      var self = this
      var inversePolymorphic = false
      try { inversePolymorphic = association.fields[inverse].polymorphic } catch (e) { }
      var parentModel = options.model || RiverDB.collections[options.name].modelName
      var association = RiverDB.models[parentModel]

      return association.where(function(child) {
        if (inversePolymorphic && child[inverse + 'Type'] != self.rdbModelName) { return false }
        var childParentId = child.get(inverse + 'Id')
        if (!childParentId) { return false }
        var withinScope = !options.where || options.where(child)
        if (typeof childParentId == 'string' && childParentId.startsWith('rdbClientId')) {
          return childParentId == self.rdbClientId && withinScope
        } else {
          return childParentId == self.id && withinScope
        }
      })
    }
  }

  model.belongsTo = function(options) {
    if ((typeof options) == 'string') { options = { name: options } }

    model.fields = model.fields || { }
    model.fields[options.name] = options

    var parentModel = options.model || options.name

    model.prototype[options.name] = function() {
      var parentId = this.get(options.name + 'Id')
      if (!parentId) { return null }
      var associatedModel = options.polymorphic ? this.get(options.name + 'Type') : parentModel
      var association = RiverDB.models[associatedModel]
      return association ? association.select(parentId) : null
    }
  }

  model._deserializers = { }
  model.addDeserializer = function(name, deserializer) {
    this._deserializers[name] = deserializer
  }

  model.deserialize = function(name, data) {
    var deserializer = this._deserializers[name]
    var deserializedModel = new this

    deserializer(deserializedModel, data)
    return deserializedModel
  }

  model._serializers = { }
  model.addSerializer = function(name, serializer) {
    this._serializers[name] = serializer
  }

  RiverDB.collections[collectionName] = new RiverDB.Collection(collectionName, modelName)

  init(model)
  return model
}

RiverDB.Model.select = function(modelName, test) {
  if (typeof test == 'number' || typeof test == 'string') {
    var id = test
    test = function(i) { return item.id == id || item.rdbClientId == id }
  }

  var model = RiverDB.models[modelName]
  var collectionData = RiverDB.collections[model.rdbCollectionName].getData()
  var ids = Object.keys(collectionData)
  for (var i = 0; i < ids.length; i++) {
    var clientId = ids[i]
    var item = new model
    item.parseAttributes(collectionData[clientId])
    item.rdbClientId = clientId
    if (test(item)) { return item }
  }
  return null
}

RiverDB.Model.selectAll = function(modelName) {
  var model = RiverDB.models[modelName]
  var collectionData = RiverDB.collections[model.rdbCollectionName].getData()
  var ids = Object.keys(collectionData)
  var items = []
  for (var i = 0; i < ids.length; i++) {
    var clientId = ids[i]
    var item = new model
    item.parseAttributes(collectionData[clientId])
    item.rdbClientId = clientId
    items.push(item)
  }
  return items
}

RiverDB.Model.clearAll = function(modelName) {
  var model = RiverDB.models[modelName]
  var collectionData = RiverDB.collections[model.rdbCollectionName].clearData()
}

RiverDB.Model.clear = function(modelName, test) {
  var model = RiverDB.models[modelName]
  var collection = RiverDB.collections[model.rdbCollectionName]
  var collectionData = collection.getData()
  var ids = Object.keys(collectionData)
  for (var i = 0; i < ids.length; i++) {
    var clientId = ids[i]
    var item = new model
    item.parseAttributes(collectionData[clientId])
    item.rdbClientId = clientId
    if (test(item)) { collection.clearItem(item) }
  }
}

RiverDB.Model.where = function(modelName, test) {
  var model = RiverDB.models[modelName]
  var collectionData = RiverDB.collections[model.rdbCollectionName].getData()
  var ids = Object.keys(collectionData)
  var items = []
  for (var i = 0; i < ids.length; i++) {
    var clientId = ids[i]
    var item = new model
    item.parseAttributes(collectionData[clientId])
    item.rdbClientId = clientId
    if (test(item)) { items.push(item) }
  }
  return items
}

/**************************************************
 * RiverDB.Model instance methods
 **************************************************/

// TODO: I don't believe defineProperty works in IE
Object.defineProperty(RiverDB.Model.prototype, 'id', { get: function () { return this.get('id') } })

RiverDB.Model.prototype.reload = function() {
  this.parseAttributes(RiverDB.collections[this.rdbCollectionName].getItem(this.rdbClientId))
}

RiverDB.Model.prototype.modelWasUpdated = function() {
  // TODO: expose an option to turn off auto reload
  this.reload()
  var self = this
  this.rdbListeners.forEach(function(listener) {
    if (listener.modelWasUpdated) { listener.modelWasUpdated(self) }
  })
}

RiverDB.Model.prototype.get = function(attr) {
  return this.rdbAttributes[attr]
}

RiverDB.Model.prototype.set = function(attr, value) {
  if (typeof attr == 'string') {
    this.rdbAttributes[attr] = value
  } else {
    // TODO: attr could be an object containing multiple attributes
  }

  return this
}

RiverDB.Model.prototype.save = function() {
  // TODO: rather than replacing the object outright, set each attribute, so if the new model is missing attributes, the old model's attrs will be kept
  RiverDB.save(this)
}

RiverDB.Model.prototype.parseAttributes = function(attrs) {
  this.rdbAttributes = RiverDB.rdbClone(attrs)
}

RiverDB.Model.prototype.listen = function(obj) {
  if (this.rdbListeners.indexOf(obj) == -1) { this.rdbListeners.push(obj) }
  RiverDB.listen(this.rdbCollectionName, this.rdbClientId, this)
}

RiverDB.Model.prototype.stopListening = function(obj) {
  let index = this.rdbListeners.indexOf(obj)
  if (index != -1) {
    this.rdbListeners.splice(index, 1)
    if (this.rdbListeners.length == 0) {
      RiverDB.stopListening(this.rdbCollectionName, this.rdbClientId, this)
    }
  }
}

RiverDB.Model.prototype.deserialize = function(name, data) {
  var deserializer = RiverDB.models[this.rdbModelName]._deserializers[name]
  deserializer(this, data)
}

RiverDB.Model.prototype.serialize = function(name) {
  var serializer = RiverDB.models[this.rdbModelName]._serializers[name]
  return serializer(this)
}
