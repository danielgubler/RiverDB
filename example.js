/**************************************************
 * Example Models
 **************************************************/

// User

class User extends RiverDB.Model {
  static get rdbModelName() { return "user" }
  static get rdbCollectionName() { return "users" }

  static get rdbProperties() {
    return {
      name: String,
      email: String
    }
  }

  static get rdbRelationships() {
    return [
      { type: "hasMany", target: Post },
      { type: "hasMany", target: Video },
      { type: "hasMany", target: Comment },
    ]
  }
}

// Post

class Post extends RiverDB.Model {
  static get rdbModelName() { return "post" }
  static get rdbCollectionName() { return "posts" }

  static get rdbProperties() {
    return {
      title: String,
      body: String
    }
  }

  static get rdbRelationships() {
    return [
      { type: "belongsTo", target: User },
      { type: "hasMany", target: Comment, inverse: "commentable" },
    ]
  }
}

// Video

class Video extends RiverDB.Model {
  static get rdbModelName() { return "video" }
  static get rdbCollectionName() { return "videos" }

  static get rdbProperties() {
    return {
      title: String,
      url: String
    }
  }

  static get rdbRelationships() {
    return [
      { type: "belongsTo", target: User },
      { type: "hasMany", target: Comment, inverse: "commentable" },
    ]
  }
}

// Comment

class Comment extends RiverDB.Model {
  static get rdbModelName() { return "comment" }
  static get rdbCollectionName() { return "comments" }

  static get rdbProperties() {
    return {
      body: String
    }
  }

  static get rdbRelationships() {
    return [
      { type: "belongsTo", target: User },
      { type: "belongsTo", target: "commentable", polymorphic: true },
    ]
  }
}

class PostWithSingleComment extends RiverDB.Model {
  static get rdbModelName() { return "postWithSingleComment" }
  static get rdbCollectionName() { return "postsWithSingleComment" }

  static get rdbProperties() {
    return {
      title: String,
      body: String
    }
  }

  static get rdbRelationships() {
    return [
      { type: "hasOne", target: Comment, inverse: "commentable" }
    ]
  }
}

/**************************************************
 * Example Usage
 **************************************************/

let user1 = new User({ id: 0 })
user1.set("name", "Testy McTestface")
user1.set("email", "testy@tester.website")
user1.save()

let user2 = new User({ id: 1 })
user2.set("name", "Mob Barley")
user2.set("email", "mob.barley@some.website")
user2.save()

for (let i = 0; i < 4; i++) {
  let post = new Post({ id: i })
  post.set("title", `Post ${i}`)
  post.set("body", "Hello ".repeat(i + 1))
  post.set("userId", i % 2)
  post.save()
}

for (let i = 0; i < 2; i++) {
  let vid = new Video({ id: i })
  vid.set("title", `Video ${i}`)
  vid.set("url", "tester.website/somevideo")
  vid.set("userId", i % 2)
  vid.save()
}

for (let i = 0; i < 6; i++) {
  let comment = new Comment({ id: i })
  comment.set("body", "Yo ".repeat(i + 1))
  comment.set("userId", i % 2)

  if (i % 2 == 0) {
    comment.set("commentableType", Post.rdbModelName)
    comment.set("commentableId", Math.floor(Math.random() * 4))
  } else {
    comment.set("commentableType", Video.rdbModelName)
    comment.set("commentableId", Math.floor(Math.random() * 2))
  }

  comment.save()
}

let postWithSingleComment = new PostWithSingleComment({ id: 0 })
postWithSingleComment.set("title", "Test Single-Comment Post")
postWithSingleComment.set("body", "Hey")
postWithSingleComment.save()

let comment = new Comment({ id: 6 })
comment.set("body", "Hello")
comment.set("userId", 0)
comment.set("commentableType", PostWithSingleComment.rdbModelName)
comment.set("commentableId", 0)
comment.save()
