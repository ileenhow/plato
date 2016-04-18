import { STATUS_CODES } from 'http'
import passport from 'koa-passport'
import only from 'only'
import _debug from 'debug'
import _passport from '../tools/passport'
import User from '../models/user'
import salt from '../utils/salt'
import { expires } from '../utils/bearer'

export default (app, router) => {
  const debug = _debug('koa:routes:auth')

  _debug('inject passport strategies')
  _passport(app)

  const whiteProps = 'username token expires'

  // refresh token
  async function refresh (user, ctx) {
    const _d = {
      token: salt(),
      expires: Date.now() + expires
    }
    await user.update(_d).exec()
    ctx.body = { ...only(user.toJSON(), whiteProps), ..._d }
    ctx.status = 201
  }

  function respond (status, { message }, ctx) {
    ctx.body = {
      code: STATUS_CODES[status],
      message
    }
    ctx.status = status || 500
  }

  function callback (user, info, status) {
    if (user === false) {
      debug(info)
      respond(400, info, this)
    } else {
      return refresh(user, this)
    }
  }

  // login
  router.post('/login', (ctx, next) => {
    return passport.authenticate('local', {
      failWithError: true
    }, callback.bind(ctx))(ctx, next)
  })

  // check
  router.get('/check', (ctx, next) => {
    return passport.authenticate('bearer', {
      session: false
    }, callback.bind(ctx))(ctx, next)
  })

  // signup
  router.post('/signup', async ctx => {
    const {
      username,
      password
    } = ctx.request.body
    const user = await User.create({ username, password })
    ctx.body = only(user.toJSON(), whiteProps)
  })

  // logout
  router.del('/logout', async (ctx, next) => {
    const token = ctx.request.token

    if (!token) {
      return respond(400, {
        message: 'Token not found.'
      }, ctx)
    }

    const user = await User.findOne({ token }).exec((err, doc) => {
      if (err) {
        return respond(400, {
          message: err.errmsg
        }, ctx)
      }
      if (!doc) {
        return respond(404, {
          message: 'Token not found.'
        }, ctx)
      }

      return doc
    })

    await user.update({
      token: '',
      expires: 0
    }).exec()

    ctx.body = {}
    ctx.status = 200
  })
}
