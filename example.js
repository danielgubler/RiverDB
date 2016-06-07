/**************************************************
 * Example Models
 **************************************************/

Store = RiverDB.Model.create('store', 'stores', function(store) {
  store.hasMany('floors')
})

Floor = RiverDB.Model.create('floor', 'floors', function(floor) {
  floor.belongsTo('store')
  floor.hasMany('areas')
  floor.hasMany('fixtures')
  floor.hasOne({ name: 'layoutPosition', inverse: 'target' })
})

Area = RiverDB.Model.create('area', 'areas', function(area) {
  area.belongsTo('store')
  area.belongsTo('floor')
  area.hasMany('fixtures')
  area.hasOne({ name: 'layoutPosition', inverse: 'target' })
})

Fixture = RiverDB.Model.create('fixture', 'fixtures', function(fixture) {
  fixture.belongsTo('store')
  fixture.belongsTo('area')
  fixture.hasMany('positions')
  fixture.hasOne({ name: 'layoutPosition', inverse: 'target', where: function(geometry) { return geometry.get('geometryType') == 'layout_position' } })
  fixture.hasOne({ name: 'modalPosition', model: 'layoutPosition', inverse: 'target', where: function(geometry) { return geometry.get('geometryType') == 'modal_position' } })
})

LayoutPosition = RiverDB.Model.create('layoutPosition', 'layoutPositions', function(geometry) {
  geometry.belongsTo({ name: 'target', polymorphic: true })
})

var floor = new Floor
floor.set('id', 1)
floor.save()

var floorGeometry = new LayoutPosition
floorGeometry.set('targetId', 1)
floorGeometry.set('targetType', 'floor')
floorGeometry.save()

console.log('floor geometry:')
console.debug(floor.layoutPosition())
