const config = require('./config.js').config
const express = require('express')
const jwt = require('jsonwebtoken')
const path = require('path')

const users = require('./data/collections/user-security.json')
const security = require('./security.json')

let app = (module.exports = express.Router())

const createToken = user => {
  return jwt.sign(
    {
      user: {
        id: user.id,
        email: user.email,
        roleDescription: user.roleDescription,
        role: user.role
      },
      exp: Math.floor(Date.now() / 1000) + 60 * 60 // 60 * 60 = 1 Hour
    },
    config.clientSecret
  )
}

const getUser = email => {
  if (!email) {
    return undefined
  } else {
    const usersFiltered = users['user-security'].filter(user => user.email === email)
    if (usersFiltered.length === 1) {
      return usersFiltered[0]
    } else {
      return undefined
    }
  }
}

app.post('/auth/get-token', function(req, res) {
  if (!req.body.email || !req.body.password) {
    return res.status(400).send('You must send the e-mail and the password')
  }
  const user = getUser(req.body.email)
  if (!user) {
    return res.status(401).send('The e-mail does not exist.')
  }
  if (req.body.password) {
    if (!(user.password === req.body.password)) {
      return res.status(401).send('The password is not correct.')
    }
  }
  res.status(201).send({
    auth_token: createToken(user)
  })
})

// User and Role Based Authentication
for (let i = 0; i < security.paths.length; i++) {
  const pathDetails = security.paths[i]
  app.use(pathDetails.path, function(req, res, next) {
    if (req.headers.authorization) {
      const decoded = jwt.verify(req.headers.authorization.split(' ')[1], config.clientSecret)
      const user = getUser(decoded.user.email)
      const access = pathDetails.access[req.method]
      if (access && user.role !== 'admin') {
        if (access.users.indexOf(user.id) !== -1) {
          if (access.userIdRestrictedRoles.indexOf(user.role) !== -1) {
            switch (req.method) {
              case 'GET':
                req.query.createdById = user.id
                next()
                break
              case 'POST':
              case 'PUT':
                if (req.body.user.id !== user.id || user.role === 'readonly') {
                  res.status(403).send(security.errors[req.method])
                } else {
                  next()
                }
                break
              case 'DELETE':
                const db = require(path.join(__dirname, config.baseDirectory, config.dbFile))
                const id = parseInt(req.url.split('/')[1])
                const collection = req.baseUrl.split('/')[1]
                const record = db[collection].filter(item => item.id === id)[0]
                if (record.createdById !== user.id || user.role === 'readonly') {
                  res.status(403).send(security.errors[req.method])
                } else {
                  next()
                }
                break
            }
          } else {
            next()
          }
        } else {
          res.status(403).send(security.errors[req.method])
        }
      } else {
        next()
      }
    } else {
      res.status(403).send('This API path requires authentication.')
    }
  })
}
