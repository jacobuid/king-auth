import express from 'express';
import session from 'express-session';
import { createKingAuth } from '@jacobuid/king-auth/server';

// This executable example uses MemoryStore for development only.
// Install a persistent express-session store before using this example in production.
if (process.env.NODE_ENV === 'production') throw new Error('Configure a persistent session store before using this example in production');
const origin = new URL(process.env.SITE_URL || 'http://localhost:4000').origin;
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw Error('Set SESSION_SECRET to at least 32 random characters');
const king = await createKingAuth({
  issuer: process.env.KING_AUTH_ISSUER || 'https://kingauth.app/api/auth',
  clientId: process.env.KING_AUTH_CLIENT_ID, clientSecret: process.env.KING_AUTH_CLIENT_SECRET,
  redirectUri: origin + '/auth/callback', allowLocalhost: true,
});
const app = express();
app.disable('x-powered-by');
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax', maxAge: 3600000 } }));
const save = req => new Promise((resolve,reject) => req.session.save(error=>error?reject(error):resolve()));
app.get('/auth/login', async(req,res,next)=>{try { const {url,transaction}=await king.begin();req.session.transaction=transaction;await save(req);res.redirect(url); }catch(error){next(error);} });
app.get('/auth/signup', async(req,res,next)=>{try { const {url,transaction}=await king.begin({createAccount:true});req.session.transaction=transaction;await save(req);res.redirect(url); }catch(error){next(error);} });
app.get('/auth/callback',async(req,res,next)=>{try{
  const transaction=req.session.transaction;delete req.session.transaction;await save(req);
  const user=await king.complete(new URL(req.originalUrl,origin),transaction);
  await new Promise((resolve,reject)=>req.session.regenerate(error=>error?reject(error):resolve()));
  req.session.user=user;await save(req);res.redirect('/');
}catch(error){next(error);} });
app.get('/auth/session',(req,res)=>{res.set('Cache-Control','no-store');res.json({user:req.session.user || null});});
app.post('/auth/logout',(req,res)=>{if(req.get('origin')!==origin)return res.sendStatus(403);req.session.destroy(()=>{res.clearCookie('connect.sid');res.redirect('/');});});
app.get('/',(req,res)=>{res.type('html').send('<h1>Example connected website</h1><p><a href="/auth/login">Sign in with King Auth</a></p><p><a href="/auth/session">View your website session</a></p><form method="post" action="/auth/logout"><button>Sign out of this website</button></form>');});
app.use((error,req,res,next)=>{console.error('Sign-in failed:',error.code || error.name);res.status(400).send('Sign-in could not be completed. Start again from /auth/login.');});
app.listen(4000,()=>console.log('Example website: '+origin));
