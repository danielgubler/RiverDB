// RiverDB.extend = function(destination, source) {
//   for (var k in source) {
//     if (source.hasOwnProperty(k)) {
//       destination[k] = source[k];
//     }
//   }
//   return destination;
// }

/**************************************************
 * RiverDB.Model
 **************************************************/

RiverDB = {
  collections: { },
  models: { },
  _listeners: {}
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
  var copy;

  // Handle the 3 simple types, and null or undefined
  if (obj == null || typeof obj == 'object') { return obj }

  // Handle Date
  if (obj instanceof Date) {
    copy = new Date();
    copy.setTime(obj.getTime());
    return copy;
  }

  // Handle Array
  if (obj instanceof Array) {
    copy = [];
    for (var i = 0, len = obj.length; i < len; i++) {
      copy[i] = clone(obj[i]);
    }
    return copy;
  }

  // Handle Object
  if (obj instanceof Object) {
    copy = {};
    for (var attr in obj) {
      if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
    }
    return copy;
  }

  throw new Error("Unable to copy obj! Its type isn't supported.");
}

RiverDB.save = function(obj) {
  this.collections[obj.rdbCollectionName].data[obj.rdbClientId] = this.rdbClone(obj.rdbAttributes)
  var listeners = this._listenersFor(obj.rdbCollectionName, obj.rdbClientId)
  console.log('RiverDB listeners:' + listeners.length)
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
  this.data = { }
  this.modelName = modelName
  this.collectionName = collectionName
}

RiverDB.Model.create = function(modelName, collectionName, init) {
  RiverDB.models[modelName] = function() {
    RiverDB.Model.call(this)
    this.rdbClientId = RiverDB.Model.generateClientId()
    this.rdbModelName = modelName
    this.rdbCollectionName = collectionName
  }

  var model = RiverDB.models[modelName]
  model.rdbModelName = modelName
  model.rdbCollectionName = collectionName

  model.prototype = Object.create(RiverDB.Model.prototype)
  model.prototype.constructor = model

  model.select = function(test) { return RiverDB.Model.select(modelName, test) }
  model.where = function(test) { return RiverDB.Model.where(modelName, test) }

  model.hasOne = function(options) {
    if ((typeof options) == 'string') { options = { name: options } }
    var inverse = options.inverse || modelName
    var parentModel = options.model || options.name

    model.prototype[options.name] = function() {
      var association = RiverDB.models[parentModel]
      return association.select(function(child) {
        var childParentId = child.get(inverse + 'Id')
        if (!childParentId) { return false }
        if (typeof childParentId == 'string' && childParentId.startsWith('rdbClientId')) {
          return childParentId == this.rdbClientId
        } else {
          return childParentId == this.id
        }
      })
    }
  }

  model.hasMany = function(options) {
    if ((typeof options) == 'string') { options = { name: options } }
    var inverse = options.inverse || modelName

    model.prototype[options.name] = function() {
      var parentModel = options.model || RiverDB.collections[options.name].modelName
      var association = RiverDB.models[parentModel]
      var thisId = this.id
      var thisClientId = this.rdbClientId
      return association.where(function(child) {
        var childParentId = child.get(inverse + 'Id')
        if (!childParentId) { return false }
        if (typeof childParentId == 'string' && childParentId.startsWith('rdbClientId')) {
          return childParentId == thisClientId
        } else {
          return childParentId == thisId
        }
      })
    }
  }

  model.belongsTo = function(options) {
    if ((typeof options) == 'string') { options = { name: options } }
    var parent = options.model || options.name
    var parentModel = options.model || options.name

    model.prototype[options.name] = function() {
      var parentId = this.get(options.name + 'Id')
      if (!parentId) { return null }
      var association = RiverDB.models[parentModel]
      return association.select(parentId)
    }
  }

  RiverDB.collections[collectionName] = new RiverDB.Collection(collectionName, modelName)

  init(model)
}

RiverDB.Model.select = function(modelName, test) {
  if (typeof test == 'number' || typeof test == 'string') {
    var id = test
    test = function(i) { return item.id == id || item.rdbClientId == id }
  }

  var model = RiverDB.models[modelName]
  var ids = Object.keys(RiverDB.collections[model.rdbCollectionName].data)
  for (var i = 0; i < ids.length; i++) {
    var clientId = ids[i]
    var item = new model
    item.parseAttributes(RiverDB.collections[model.rdbCollectionName].data[clientId])
    item.rdbClientId = clientId
    if (test(item)) { return item }
  }
  return null
}

RiverDB.Model.where = function(modelName, test) {
  var model = RiverDB.models[modelName]
  var ids = Object.keys(RiverDB.collections[model.rdbCollectionName].data)
  var items = []
  for (var i = 0; i < ids.length; i++) {
    var clientId = ids[i]
    var item = new model
    item.parseAttributes(RiverDB.collections[model.rdbCollectionName].data[clientId])
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
  this.parseAttributes(RiverDB.collections[this.rdbCollectionName].data[this.rdbClientId])
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

/**************************************************
 * Example Models
 **************************************************/

RiverDB.Model.create('person', 'people', function(person) {
  person.hasMany({ name: 'pets', inverse: 'owner' })
  person.hasOne('job')
  person.hasOne({ name: 'career', through: 'job'})
})

RiverDB.Model.create('pet', 'pets', function(pet) {
  pet.belongsTo({ name: 'owner', model: 'person'})
})

RiverDB.Model.create('career', 'careers', function(career) {
  career.hasMany('jobs')
  career.hasMany({ name: 'people', through: 'jobs'})
})

RiverDB.Model.create('job', 'jobs', function(job) {
  job.belongsTo('career')
  job.belongsTo('person')
})

RiverDB.Model.create('layoutPosition', 'layoutPositions', function(geometry) {
  geometry.belongsTo({ name: 'target', polymorphic: true })
})

Person = RiverDB.models.person
Pet = RiverDB.models.pet

var b = new Person
b.set('name', 'bob')
b.set('id', 7)
b.save()

var d = new Pet
d.set('name', 'dog')
d.set('ownerId', b.id)
d.save()

b.pets()

var listener = {
  modelWasUpdated: function(model) {
    console.log('model ' + model.rdbModelName + ':' + model.id + ' was updated')
  }
}

b.listen(listener)

var p = Person.select(7)
p.set('age', 28)
p.save()
