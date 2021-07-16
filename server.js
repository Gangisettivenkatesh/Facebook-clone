var express = require("express");
var app = express();

var formidable = require("express-formidable");
app.use(formidable());

var mongodb = require("mongodb");
var mongoClient = mongodb.MongoClient;
var ObjectId = mongodb.ObjectId;

var http = require("http").createServer(app);
var bcrypt = require("bcrypt");
var fileSystem = require("fs");

var nodemailer = require("nodemailer");
var requestModule = require('request');

var functions = require("./modules/functions");
var chat = require("./modules/chat");
var addPost = require("./modules/add-post");
var editPost = require("./modules/edit-post");

var jwt = require("jsonwebtoken");
var accessTokenSecret = "myAccessTokenSecret1234567890";

const Cryptr = require("cryptr");
const cryptr = new Cryptr("mySecretKey");

const Filter = require("bad-words");
const filter = new Filter();

var admin = require("./modules/admin");
admin.init(app, express);

app.use("/public", express.static(__dirname + "/public"));
app.set("view engine", "ejs");

var socketIO = require("socket.io")(http);
var socketID = "";
var users = [];

var mainURL = "http://localhost:3000";

var nodemailerFrom = "venkateshgangisetti9@gmail.com";
var nodemailerObject = {
    service: "gmail",
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: "venkateshgangisetti9@gmail.com",
        pass: "9491435335"
    }
};

socketIO.on("connection", function(socket) {
    // console.log("User connected", socket.id);
    socketID = socket.id;
});

http.listen(3000, function() {
console.log("Server started at " + mainURL);

mongoClient.connect("mongodb://localhost:27017", {
    useUnifiedTopology: true
}, function(error, client) {
    var database = client.db("my_social_network");
    console.log("Database connected.");

    functions.database = database;

    chat.database = database;
    chat.socketIO = socketIO;
    chat.users = users;
    chat.ObjectId = ObjectId;
    chat.fileSystem = fileSystem;
    chat.cryptr = cryptr;
    chat.filter = filter;

    page.database = database;
    page.ObjectId = ObjectId;
    page.fileSystem = fileSystem;

    group.database = database;
    group.ObjectId = ObjectId;
    group.fileSystem = fileSystem;

    addPost.database = database;
    addPost.functions = functions;
    addPost.fileSystem = fileSystem;
    addPost.requestModule = requestModule;
    addPost.filter = filter;
    addPost.ObjectId = ObjectId;

    editPost.database = database;
    editPost.functions = functions;
    editPost.fileSystem = fileSystem;
    editPost.requestModule = requestModule;
    editPost.filter = filter;
    editPost.ObjectId = ObjectId;

    admin.database = database;
    admin.bcrypt = bcrypt;
    admin.jwt = jwt;
    admin.ObjectId = ObjectId;
    admin.fileSystem = fileSystem;
    admin.mainURL = mainURL;

    app.get("/signup", function(request, result) {
        result.render("signup");
    });

    app.get("/verifyEmail/:email/:verification_token", function(request, result) {

        var email = request.params.email;
        var verification_token = request.params.verification_token;

        database.collection("users").findOne({
            $and: [{
                "email": email,
            }, {
                "verification_token": parseInt(verification_token)
            }]
        }, function(error, user) {
            if (user == null) {
                result.json({
                    'status': "error",
                    'message': 'Email does not exists. Or verification link is expired.'
                });
            } else {

                database.collection("users").findOneAndUpdate({
                    $and: [{
                        "email": email,
                    }, {
                        "verification_token": parseInt(verification_token)
                    }]
                }, {
                    $set: {
                        "verification_token": "",
                        "isVerified": true
                    }
                }, function(error, data) {
                    result.json({
                        'status': "success",
                        'message': 'Account has been verified. Please try login.'
                    });
                });
            }
        });
    });

    app.post("/signup", function(request, result) {
        var name = request.fields.name;
        var username = request.fields.username;
        var email = request.fields.email;
        var password = request.fields.password;
        var gender = request.fields.gender;
        var reset_token = "";
        var isVerified = false;
        var isBanned = false;
        var verification_token = new Date().getTime();

        database.collection("users").findOne({
            $or: [{
                "email": email
            }, {
                "username": username
            }]
        }, function(error, user) {
            if (user == null) {
                bcrypt.hash(password, 10, function(error, hash) {
                    database.collection("users").insertOne({
                        "name": name,
                        "username": username,
                        "email": email,
                        "password": hash,
                        "gender": gender,
                        "reset_token": reset_token,
                        "profileImage": "",
                        "coverPhoto": "",
                        "dob": "",
                        "city": "",
                        "country": "",
                        "aboutMe": "",
                        "friends": [],
                        "pages": [],
                        "notifications": [],
                        "groups": [],
                        "isVerified": isVerified,
                        "verification_token": verification_token,
                        "isBanned": isBanned
                    }, function(error, data) {

                        var transporter = nodemailer.createTransport(nodemailerObject);

                        var text = "Please verify your account by click the following link: " + mainURL + "/verifyEmail/" + email + "/" + verification_token;
                        var html = "Please verify your account by click the following link: <br><br> <a href='" + mainURL + "/verifyEmail/" + email + "/" + verification_token + "'>Confirm Email</a> <br><br> Thank you.";

                        transporter.sendMail({
                            from: nodemailerFrom,
                            to: email,
                            subject: "Email Verification",
                            text: text,
                            html: html
                        }, function(error, info) {
                            if (error) {
                                console.error(error);
                            } else {
                                console.log("Email sent: " + info.response);
                            }

                            result.json({
                                "status": "success",
                                "message": "Signed up successfully. An email has been sent to verify your account. Once verified, you will be able to login and start using social network."
                            });

                        });

                    });
                });
            } else {
                result.json({
                    "status": "error",
                    "message": "Email or username already exist."
                });
            }
        });
    });

    app.get("/login", function(request, result) {
        result.render("login");
    });

    app.post("/login", function(request, result) {
        var email = request.fields.email;
        var password = request.fields.password;
        database.collection("users").findOne({
            "email": email
        }, function(error, user) {
            if (user == null) {
                result.json({
                    "status": "error",
                    "message": "Email does not exist"
                });
            } else {

                if (user.isBanned) {
                    result.json({
                        "status": "error",
                        "message": "You have been banned."
                    });
                    return false;
                }

                bcrypt.compare(password, user.password, function(error, isVerify) {
                    if (isVerify) {

                        if (user.isVerified) {
                            var accessToken = jwt.sign({ email: email }, accessTokenSecret);
                            database.collection("users").findOneAndUpdate({
                                "email": email
                            }, {
                                $set: {
                                    "accessToken": accessToken
                                }
                            }, function(error, data) {
                                result.json({
                                    "status": "success",
                                    "message": "Login successfully",
                                    "accessToken": accessToken,
                                    "profileImage": user.profileImage
                                });
                            });
                        } else {
                            result.json({
                                "status": "error",
                                "message": "Kindly verify your email."
                            });
                        }

                    } else {
                        result.json({
                            "status": "error",
                            "message": "Password is not correct"
                        });
                    }
                });
            }
        });
    });

    app.get("/user/:username", function(request, result) {
        database.collection("users").findOne({
            "username": request.params.username
        }, function(error, user) {
            if (user == null) {
                result.render("errors/404", {
                    "message": "This account does not exists anymore."
                });
            } else {
                result.render("userProfile", {
                    "user": user
                });
            }
        });
    });

    app.get("/updateProfile", function(request, result) {
        result.render("updateProfile");
    });

    app.post("/getUser", async function(request, result) {
        var accessToken = request.fields.accessToken;

        var user = await database.collection("users").findOne({
            "accessToken": accessToken
        });

        if (user == null) {
            result.json({
                "status": "error",
                "message": "User has been logged out. Please login again."
            });
        } else {

            if (user.isBanned) {
                result.json({
                    "status": "error",
                    "message": "You have been banned."
                });
                return false;
            }

            user.profileViewers = await database.collection("profile_viewers").find({
                "profile._id": user._id
            }).toArray();

            user.pages = await database.collection("pages").find({
                "user._id": user._id
            }).toArray();

            result.json({
                "status": "success",
                "message": "Record has been fetched.",
                "data": user
            });
        }
    });

    app.get("/logout", function(request, result) {
        result.redirect("/login");
    });

    app.post("/uploadCoverPhoto", function(request, result) {
        var accessToken = request.fields.accessToken;
        var coverPhoto = "";

        database.collection("users").findOne({
            "accessToken": accessToken
        }, function(error, user) {
            if (user == null) {
                result.json({
                    "status": "error",
                    "message": "User has been logged out. Please login again."
                });
            } else {

                if (user.isBanned) {
                    result.json({
                        "status": "error",
                        "message": "You have been banned."
                    });
                    return false;
                }

                if (request.files.coverPhoto.size > 0 && request.files.coverPhoto.type.includes("image")) {

                    if (user.coverPhoto != "") {
                        fileSystem.unlink(user.coverPhoto, function(error) {
                            //
                        });
                    }

                    coverPhoto = "public/images/cover-" + new Date().getTime() + "-" + request.files.coverPhoto.name;

                    // Read the file
                    fileSystem.readFile(request.files.coverPhoto.path, function(err, data) {
                        if (err) throw err;
                        console.log('File read!');

                        // Write the file
                        fileSystem.writeFile(coverPhoto, data, function(err) {
                            if (err) throw err;
                            console.log('File written!');

                            database.collection("users").updateOne({
                                "accessToken": accessToken
                            }, {
                                $set: {
                                    "coverPhoto": coverPhoto
                                }
                            }, function(error, data) {
                                result.json({
                                    "status": "status",
                                    "message": "Cover photo has been updated.",
                                    data: mainURL + "/" + coverPhoto
                                });
                            });
                        });

                        // Delete the file
                        fileSystem.unlink(request.files.coverPhoto.path, function(err) {
                            if (err) throw err;
                            console.log('File deleted!');
                        });
                    });

                } else {
                    result.json({
                        "status": "error",
                        "message": "Please select valid image."
                    });
                }
            }
        });
    });

    app.post("/uploadProfileImage", function(request, result) {
        var accessToken = request.fields.accessToken;
        var profileImage = "";

        database.collection("users").findOne({
            "accessToken": accessToken
        }, function(error, user) {
            if (user == null) {
                result.json({
                    "status": "error",
                    "message": "User has been logged out. Please login again."
                });
            } else {

                if (user.isBanned) {
                    result.json({
                        "status": "error",
                        "message": "You have been banned."
                    });
                    return false;
                }

                if (request.files.profileImage.size > 0 && request.files.profileImage.type.includes("image")) {

                    if (user.profileImage != "") {
                        fileSystem.unlink(user.profileImage, function(error) {
                            // console.log("error deleting file: " + error);
                        });
                    }

                    profileImage = "public/images/profile-" + new Date().getTime() + "-" + request.files.profileImage.name;

                    // Read the file
                    fileSystem.readFile(request.files.profileImage.path, function(err, data) {
                        if (err) throw err;
                        console.log('File read!');

                        // Write the file
                        fileSystem.writeFile(profileImage, data, function(err) {
                            if (err) throw err;
                            console.log('File written!');

                            database.collection("users").updateOne({
                                "accessToken": accessToken
                            }, {
                                $set: {
                                    "profileImage": profileImage
                                }
                            }, async function(error, data) {

                                await functions.updateUser(user, profileImage, user.name);

                                result.json({
                                    "status": "status",
                                    "message": "Profile image has been updated.",
                                    data: mainURL + "/" + profileImage
                                });
                            });
                        });

                        // Delete the file
                        fileSystem.unlink(request.files.profileImage.path, function(err) {
                            if (err) throw err;
                            console.log('File deleted!');
                        });
                    });

                } else {
                    result.json({
                        "status": "error",
                        "message": "Please select valid image."
                    });
                }
            }
        });
    });

    app.post("/updateProfile", function(request, result) {
        var accessToken = request.fields.accessToken;
        var name = request.fields.name;
        var dob = request.fields.dob;
        var city = request.fields.city;
        var country = request.fields.country;
        var aboutMe = request.fields.aboutMe;

        database.collection("users").findOne({
            "accessToken": accessToken
        }, function(error, user) {
            if (user == null) {
                result.json({
                    "status": "error",
                    "message": "User has been logged out. Please login again."
                });
            } else {

                if (user.isBanned) {
                    result.json({
                        "status": "error",
                        "message": "You have been banned."
                    });
                    return false;
                }

                database.collection("users").updateOne({
                    "accessToken": accessToken
                }, {
                    $set: {
                        "name": name,
                        "dob": dob,
                        "city": city,
                        "country": country,
                        "aboutMe": aboutMe
                    }
                }, async function(error, data) {

                    await functions.updateUser(user, user.profileImage, name);

                    result.json({
                        "status": "status",
                        "message": "Profile has been updated."
                    });
                });
            }
        });
    });

    app.get("/post/:id", function(request, result) {
        database.collection("posts").findOne({
            "_id": ObjectId(request.params.id)
        }, function(error, post) {
            if (post == null) {
                result.render("errors/404", {
                    "message": "This post does not exist anymore."
                });
            } else {
                result.render("postDetail", {
                    "post": post
                });
            }
        });
    });

    app.get("/", function(request, result) {
        result.render("index");
    });

    app.post("/addPost", function(request, result) {
        addPost.execute(request, result);
    });

    app.post("/getUserFeed", async function(request, result) {
        var username = request.fields.username;
        var authUsername = request.fields.auth_user;

        var profile = await database.collection("users").findOne({
            "username": username
        });
        if (profile == null) {
            result.json({
                "status": "error",
                "message": "User does not exist."
            });
            return;
        }

        var authUser = await database.collection("users").findOne({
            "username": authUsername
        });
        if (authUser == null) {
            result.json({
                "status": "error",
                "message": "Sorry, you have been logged out."
            });
            return;
        }

        /* add or update the profile views counter */
        if (authUsername != username) {
            var hasViewed = await database.collection("profile_viewers").findOne({
                $and: [{
                    "profile._id": profile._id
                }, {
                    "user._id": authUser._id
                }]
            });
            if (hasViewed == null) {
                /* insert the view. */
                /* username is saved so the other person can visit his profile. */
                await database.collection("profile_viewers").insertOne({
                    "profile": {
                        "_id": profile._id,
                        "name": profile.name,
                        "username": profile.username,
                        "profileImage": profile.profileImage
                    },
                    "user": {
                        "_id": authUser._id,
                        "name": authUser.name,
                        "username": authUser.username,
                        "profileImage": authUser.profileImage
                    },
                    "views": 1,
                    "viewed_at": new Date().getTime()
                });
            } else {
                /* increment the counter and time */
                await database.collection("profile_viewers").updateOne({
                    "_id": hasViewed._id
                }, {
                    $inc: {
                        "views": 1
                    },
                    $set: {
                        "viewed_at": new Date().getTime()
                    }
                });
            }
        }

        database.collection("posts")
            .find({
                "user._id": profile._id
            })
            .sort({
                "createdAt": -1
            })
            .limit(5)
            .toArray(function(error, data) {
                result.json({
                    "status": "success",
                    "message": "Record has been fetched",
                    "data": data
                });
            });
    });



    app.post("/toggleLikePost", function(request, result) {

        var accessToken = request.fields.accessToken;
        var _id = request.fields._id;

        database.collection("users").findOne({
            "accessToken": accessToken
        }, function(error, user) {
            if (user == null) {
                result.json({
                    "status": "error",
                    "message": "User has been logged out. Please login again."
                });
            } else {

                if (user.isBanned) {
                    result.json({
                        "status": "error",
                        "message": "You have been banned."
                    });
                    return false;
                }

                database.collection("posts").findOne({
                    "_id": ObjectId(_id)
                }, function(error, post) {
                    if (post == null) {
                        result.json({
                            "status": "error",
                            "message": "Post does not exist."
                        });
                    } else {

                        var isLiked = false;
                        for (var a = 0; a < post.likers.length; a++) {
                            var liker = post.likers[a];

                            if (liker._id.toString() == user._id.toString()) {
                                isLiked = true;
                                break;
                            }
                        }

                        if (isLiked) {
                            database.collection("posts").updateOne({
                                "_id": ObjectId(_id)
                            }, {
                                $pull: {
                                    "likers": {
                                        "_id": user._id,
                                    }
                                }
                            }, function(error, data) {
                                result.json({
                                    "status": "unliked",
                                    "message": "Post has been unliked."
                                });
                            });
                        } else {

                            database.collection("users").updateOne({
                                "_id": post.user._id
                            }, {
                                $push: {
                                    "notifications": {
                                        "_id": ObjectId(),
                                        "type": "photo_liked",
                                        "content": user.name + " has liked your post.",
                                        "profileImage": user.profileImage,
                                        "isRead": false,
                                        "post": {
                                            "_id": post._id
                                        },
                                        "createdAt": new Date().getTime()
                                    }
                                }
                            });

                            database.collection("posts").updateOne({
                                "_id": ObjectId(_id)
                            }, {
                                $push: {
                                    "likers": {
                                        "_id": user._id,
                                        "name": user.name,
                                        "username": user.username,
                                        "profileImage": user.profileImage,
                                        "createdAt": new Date().getTime()
                                    }
                                }
                            }, function(error, data) {
                                result.json({
                                    "status": "success",
                                    "message": "Post has been liked."
                                });
                            });
                        }

                    }
                });

            }
        });
    });

    app.post("/postComment", function(request, result) {

        var accessToken = request.fields.accessToken;
        var _id = request.fields._id;
        var comment = request.fields.comment;
        var createdAt = new Date().getTime();

        database.collection("users").findOne({
            "accessToken": accessToken
        }, function(error, user) {
            if (user == null) {
                result.json({
                    "status": "error",
                    "message": "User has been logged out. Please login again."
                });
            } else {

                if (user.isBanned) {
                    result.json({
                        "status": "error",
                        "message": "You have been banned."
                    });
                    return false;
                }

                database.collection("posts").findOne({
                    "_id": ObjectId(_id)
                }, function(error, post) {
                    if (post == null) {
                        result.json({
                            "status": "error",
                            "message": "Post does not exist."
                        });
                    } else {

                        var commentId = ObjectId();

                        database.collection("posts").updateOne({
                            "_id": ObjectId(_id)
                        }, {
                            $push: {
                                "comments": {
                                    "_id": commentId,
                                    "user": {
                                        "_id": user._id,
                                        "name": user.name,
                                        "profileImage": user.profileImage,
                                    },
                                    "comment": comment,
                                    "createdAt": createdAt,
                                    "replies": []
                                }
                            }
                        }, function(error, data) {

                            if (user._id.toString() != post.user._id.toString()) {
                                database.collection("users").updateOne({
                                    "_id": post.user._id
                                }, {
                                    $push: {
                                        "notifications": {
                                            "_id": ObjectId(),
                                            "type": "new_comment",
                                            "content": user.name + " commented on your post.",
                                            "profileImage": user.profileImage,
                                            "post": {
                                                "_id": post._id
                                            },
                                            "isRead": false,
                                            "createdAt": new Date().getTime()
                                        }
                                    }
                                });
                            }

                            database.collection("posts").findOne({
                                "_id": ObjectId(_id)
                            }, function(error, updatePost) {
                                result.json({
                                    "status": "success",
                                    "message": "Comment has been posted.",
                                    "updatePost": updatePost
                                });
                            });
                        });

                    }
                });
            }
        });
    });


    app.get("/search/:query", function(request, result) {
        var query = request.params.query;
        result.render("search", {
            "query": query
        });
    });

    app.post("/search", function(request, result) {
        var query = request.fields.query;
        database.collection("users").find({
            $or: [{
                "name": {
                    $regex: ".*" + query + ".*",
                    $options: "i"
                }
            }, {
                "username": {
                    $regex: ".*" + query + ".*",
                    $options: "i"
                }
            }, {
                "email": {
                    $regex: ".*" + query + ".*",
                    $options: "i"
                }
            }]
        }).toArray(function(error, data) {

            database.collection("pages").find({
                "name": {
                    $regex: ".*" + query + ".*",
                    $options: "i"
                }
            }).toArray(function(error, pages) {

                database.collection("groups").find({
                    "name": {
                        $regex: ".*" + query + ".*",
                        $options: "i"
                    }
                }).toArray(function(error, groups) {

                    result.json({
                        "status": "success",
                        "message": "Record has been fetched",
                        "data": data,
                        "pages": pages,
                        "groups": groups
                    });
                });
            });
        });
    });

    app.post("/sendFriendRequest", function(request, result) {

        var accessToken = request.fields.accessToken;
        var _id = request.fields._id;

        database.collection("users").findOne({
            "accessToken": accessToken
        }, function(error, user) {
            if (user == null) {
                result.json({
                    "status": "error",
                    "message": "User has been logged out. Please login again."
                });
            } else {

                if (user.isBanned) {
                    result.json({
                        "status": "error",
                        "message": "You have been banned."
                    });
                    return false;
                }

                var me = user;
                database.collection("users").findOne({
                    "_id": ObjectId(_id)
                }, function(error, user) {
                    if (user == null) {
                        result.json({
                            "status": "error",
                            "message": "User does not exist."
                        });
                    } else {

                        if (_id.toString() == me._id.toString()) {
                            result.json({
                                "status": "error",
                                "message": "You cannot send a friend request to yourself."
                            });
                            return;
                        }

                        database.collection("users").findOne({
                            $and: [{
                                "_id": ObjectId(_id)
                            }, {
                                "friends._id": me._id
                            }]
                        }, function(error, isExists) {
                            if (isExists) {
                                result.json({
                                    "status": "error",
                                    "message": "Friend request already sent."
                                });
                            } else {
                                database.collection("users").updateOne({
                                    "_id": ObjectId(_id)
                                }, {
                                    $push: {
                                        "friends": {
                                            "_id": me._id,
                                            "name": me.name,
                                            "username": me.username,
                                            "profileImage": me.profileImage,
                                            "status": "Pending",
                                            "sentByMe": false,
                                            "inbox": []
                                        }
                                    }
                                }, function(error, data) {

                                    database.collection("users").updateOne({
                                        "_id": me._id
                                    }, {
                                        $push: {
                                            "friends": {
                                                "_id": user._id,
                                                "name": user.name,
                                                "username": user.username,
                                                "profileImage": user.profileImage,
                                                "status": "Pending",
                                                "sentByMe": true,
                                                "inbox": []
                                            }
                                        }
                                    }, function(error, data) {

                                        result.json({
                                            "status": "success",
                                            "message": "Friend request has been sent."
                                        });

                                    });

                                });
                            }
                        });
                    }
                });
            }
        });
    });

    app.get("/friends", function(request, result) {
        result.render("friends");
    });

    app.post("/acceptFriendRequest", function(request, result) {

            var accessToken = request.fields.accessToken;
            var _id = request.fields._id;

            database.collection("users").findOne({
                    "accessToken": accessToken
                }, function(error, user) {
                    if (user == null) {
                        result.json({
                            "status": "error",
                            "message": "User has been logged out. Please login again."
                        });
                    }
                    var me = user;
                    database.collection("users").findOne({
                        "_id": ObjectId(_id)
                    }, function(error, user) {
                        if (user == null) {
                            result.json({
                                "status": "error",
                                "message": "User does not exist."
                            });
                        } else {

                            for (var a = 0; a < me.friends.length; a++) {
                                if (me.friends[a]._id.toString() == _id.toString() &&
                                    me.friends[a].status == "Accepted") {
                                    result.json({
                                        "status": "error",
                                        "message": "Friend request already accepted."
                                    });
                                    return;
                                }
                            }

                            database.collection("users").updateOne({
                                "_id": ObjectId(_id)
                            }, {
                                $push: {
                                    "notifications": {
                                        "_id": ObjectId(),
                                        "type": "friend_request_accepted",
                                        "content": me.name + " accepted your friend request.",
                                        "profileImage": me.profileImage,
                                        "isRead": false,
                                        "createdAt": new Date().getTime()
                                    }
                                }
                            });

                            database.collection("users").updateOne({
                                $and: [{
                                    "_id": ObjectId(_id)
                                }, {
                                    "friends._id": me._id
                                }]
                            }, {
                                $set: {
                                    "friends.$.status": "Accepted"
                                }
                            }, function(error, data) {

                                database.collection("users").updateOne({
                                    $and: [{
                                        "_id": me._id
                                    }, {
                                        "friends._id": user._id
                                    }]
                                }, {
                                    $set: {
                                        "friends.$.status": "Accepted"
                                    }
                                }, function(error, data) {

                                    result.json({
                                        "status": "success",
                                        "message": "Friend request has been accepted."
                                    });

                                });

                            });

                        }
                    });
                }
            });
    });

app.post("/unfriend", function(request, result) {

    var accessToken = request.fields.accessToken;
    var _id = request.fields._id;

    database.collection("users").findOne({
        "accessToken": accessToken
    }, function(error, user) {
        if (user == null) {
            result.json({
                "status": "error",
                "message": "User has been logged out. Please login again."
            });
        } else {

            if (user.isBanned) {
                result.json({
                    "status": "error",
                    "message": "You have been banned."
                });
                return false;
            }

            var me = user;
            database.collection("users").findOne({
                "_id": ObjectId(_id)
            }, function(error, user) {
                if (user == null) {
                    result.json({
                        "status": "error",
                        "message": "User does not exist."
                    });
                } else {

                    database.collection("users").updateOne({
                        "_id": ObjectId(_id)
                    }, {
                        $pull: {
                            "friends": {
                                "_id": me._id
                            }
                        }
                    }, function(error, data) {

                        database.collection("users").updateOne({
                            "_id": me._id
                        }, {
                            $pull: {
                                "friends": {
                                    "_id": user._id
                                }
                            }
                        }, function(error, data) {

                            result.json({
                                "status": "success",
                                "message": "Friend has been removed."
                            });

                        });

                    });

                }
            });
        }
    });
});

app.get("/inbox", function(request, result) {
    result.render("inbox");
});

app.post("/sendMessage", function(request, result) {
    chat.sendMessage(request, result);
});

app.post("/getFriendsChat", function(request, result) {
    chat.getFriendsChat(request, result);
});

app.post("/connectSocket", function(request, result) {
        var accessToken = request.fields.accessToken;
        database.collection("users").findOne({
                "accessToken": accessToken
            }, function(error, user) {
                if (user == null) {
                    result.json({
                        "status": "error",
                        "message": "User has been logged out. Please login again."
                    });
                }

                users[user._id] = socketID;
                result.json({
                    "status": "status",
                    "message": "Socket has been connected."
                });
            }
        });
});





app.post("/sharePost", function(request, result) {

var accessToken = request.fields.accessToken;
var _id = request.fields._id;
var type = "shared";
var createdAt = new Date().getTime();

database.collection("users").findOne({
    "accessToken": accessToken
}, function(error, user) {
    if (user == null) {
        result.json({
            "status": "error",
            "message": "User has been logged out. Please login again."
        });
    } else {

        if (user.isBanned) {
            result.json({
                "status": "error",
                "message": "You have been banned."
            });
            return false;
        }

        database.collection("posts").findOne({
            "_id": ObjectId(_id)
        }, function(error, post) {
            if (post == null) {
                result.json({
                    "status": "error",
                    "message": "Post does not exist."
                });
            } else {

                database.collection("posts").updateOne({
                    "_id": ObjectId(_id)
                }, {
                    $push: {
                        "shares": {
                            "_id": user._id,
                            "name": user.name,
                            "username": user.username,
                            "profileImage": user.profileImage,
                            "createdAt": new Date().getTime()
                        }
                    }
                }, function(error, data) {

                    database.collection("posts").insertOne({
                        "caption": post.caption,
                        "image": post.image,
                        "video": post.video,
                        "type": type,
                        "createdAt": createdAt,
                        "likers": [],
                        "comments": [],
                        "shares": [],
                        "user": {
                            "_id": user._id,
                            "name": user.name,
                            "gender": user.gender,
                            "profileImage": user.profileImage
                        }
                    }, function(error, data) {

                        database.collection("users").updateOne({
                            $and: [{
                                "_id": post.user._id
                            }, {
                                "posts._id": post._id
                            }]
                        }, {
                            $push: {
                                "posts.$[].shares": {
                                    "_id": user._id,
                                    "name": user.name,
                                    "profileImage": user.profileImage
                                }
                            }
                        });

                        result.json({
                            "status": "success",
                            "message": "Post has been shared."
                        });
                    });
                });
            }
        });
    }
});
});



app.post("/editPost", async function(request, result) {
editPost.execute(request, result);
});

app.post("/deletePost", async function(request, result) {
var accessToken = request.fields.accessToken;
var _id = request.fields._id;

var user = await database.collection("users").findOne({
    "accessToken": accessToken
});

if (user == null) {
    result.json({
        "status": "error",
        "message": "User has been logged out. Please login again."
    });
    return false;
}

var post = await database.collection("posts").findOne({
    "_id": ObjectId(_id)
});

if (post == null) {
    result.json({
        "status": "error",
        "message": "Post does not exist."
    });
    return false;
}

var isMyUploaded = false;

if (post.type == "group_post") {
    isMyUploaded = (post.uploader._id.toString() == user._id.toString());
} else {
    isMyUploaded = (post.user._id.toString() == user._id.toString());
}

if (!isMyUploaded) {
    result.json({
        "status": "error",
        "message": "Sorry, you do not own this post."
    });
    return false;
}

await database.collection("posts").remove({
    "_id": post._id
});

result.json({
    "status": "success",
    "message": "Post has been deleted."
});
});

app.post("/fetch-more-posts", async function(request, result) {
var accessToken = request.fields.accessToken;
var start = parseInt(request.fields.start);

var user = await database.collection("users").findOne({
    "accessToken": accessToken
});

if (user == null) {
    result.json({
        "status": "error",
        "message": "User has been logged out. Please login again."
    });
    return false;
}

var ids = [];
ids.push(user._id);

for (var a = 0; a < user.pages.length; a++) {
    ids.push(user.pages[a]._id);
}

for (var a = 0; a < user.groups.length; a++) {
    if (user.groups[a].status == "Accepted") {
        ids.push(user.groups[a]._id);
    }
}

for (var a = 0; a < user.friends.length; a++) {
    if (user.friends[a].status == "Accepted") {
        ids.push(user.friends[a]._id);
    }
}

const posts = await database.collection("posts")
    .find({
        "user._id": {
            $in: ids
        }
    })
    .sort({
        "createdAt": -1
    })
    .skip(start)
    .limit(5)
    .toArray();

result.json({
    "status": "success",
    "message": "Record has been fetched",
    "data": posts
});
});

app.post("/showPostLikers", async function(request, result) {
var accessToken = request.fields.accessToken;
var _id = request.fields._id;

var user = await database.collection("users").findOne({
    "accessToken": accessToken
});

if (user == null) {
    result.json({
        "status": "error",
        "message": "User has been logged out. Please login again."
    });
    return false;
}

if (user.isBanned) {
    result.json({
        "status": "error",
        "message": "You have been banned."
    });
    return false;
}

var post = await database.collection("posts").findOne({
    "_id": ObjectId(_id)
});

if (post == null) {
    result.json({
        "status": "error",
        "message": "Post does not exist."
    });
    return false;
}

result.json({
    "status": "success",
    "message": "Data has been fetched.",
    "data": post.likers
});
});

app.post("/showPostSharers", async function(request, result) {
var accessToken = request.fields.accessToken;
var _id = request.fields._id;

var user = await database.collection("users").findOne({
    "accessToken": accessToken
});

if (user == null) {
    result.json({
        "status": "error",
        "message": "User has been logged out. Please login again."
    });
    return false;
}

if (user.isBanned) {
    result.json({
        "status": "error",
        "message": "You have been banned."
    });
    return false;
}

var post = await database.collection("posts").findOne({
    "_id": ObjectId(_id)
});

if (post == null) {
    result.json({
        "status": "error",
        "message": "Post does not exist."
    });
    return false;
}

result.json({
    "status": "success",
    "message": "Data has been fetched.",
    "data": post.shares
});
});
});

});
});