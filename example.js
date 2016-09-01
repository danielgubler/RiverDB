/**************************************************
 * Example Models
 **************************************************/

// Store

class Store extends RiverDB.Model {
  static get rdbModelName() { return "store" }
  static get rdbCollectionName() { return "stores" }
}

Store.hasMany("floors")

// Floor

class Floor extends RiverDB.Model {
  static get rdbModelName() { return "floor" }
  static get rdbCollectionName() { return "floor" }
}
Floor.belongsTo('store')
Floor.hasMany('areas')
Floor.hasMany('fixtures')
Floor.hasOne({ name: 'layoutPosition', inverse: 'target' })

// Area

class Area extends RiverDB.Model {
  static get rdbModelName() { return "area" }
  static get rdbCollectionName() { return "areas" }
}

Area.belongsTo('store')
Area.belongsTo('floor')
Area.hasMany('fixtures')
Area.hasOne({ name: 'layoutPosition', inverse: 'target' })

// Fixture

class Fixture extends RiverDB.Model {
  static get rdbModelName() { return "fixture" }
  static get rdbCollectionName() { return "fixtures" }
}

Fixture.belongsTo('store')
Fixture.belongsTo('area')
Fixture.hasMany('positions')
Fixture.hasOne({
  name: 'layoutPosition',
  inverse: 'target',
  where: function(geometry) {
    return geometry.get('geometryType') == 'layout_position'
  }
})

// Layout

class LayoutPosition extends RiverDB.Model {
  static get rdbModelName() { return "layoutPosition" }
  static get rdbCollectionName() { return "layoutPositions" }
}

LayoutPosition.belongsTo({ name: 'target', polymorphic: true })

/**************************************************
 * Example Usage
 **************************************************/

let floor = new Floor()
floor.setAttr('id', 1)
floor.save()

let floorGeometry = new LayoutPosition()
floorGeometry.setAttr('targetId', 1)
floorGeometry.setAttr('targetType', 'floor')
floorGeometry.save()

console.log('floor geometry:', floor.layoutPosition())
