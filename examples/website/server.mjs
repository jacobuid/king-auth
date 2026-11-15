import express from 'express';
import {fileURLToPath} from 'node:url';
import {createKingAuthServer} from '@jacobuid/king-auth/server';

const origin=process.env.SITE_URL||'http://localhost:4000';
const king=createKingAuthServer({
  origin,secret:process.env.SESSION_SECRET,
  issuer:process.env.KING_AUTH_ISSUER||'https://kingauth.app/api/auth',
  allowLocalhost:process.env.NODE_ENV!=='production',
});
const app=express();app.disable('x-powered-by');
// Install at the root so the adapter can check the complete URL itself.
app.use(king.handler);
app.get('/api/private',async(req,res,next)=>{try{
  const session=await king.getSession(req,res);
  res.set('Cache-Control','no-store');
  if(!session)return res.status(401).json({message:'Sign in first'});
  // Use the permanent UUID for your own site's data and permission checks.
  res.json({message:'This came from a protected backend route',userId:session.user.id});
}catch(error){next(error);}});
app.use(express.static(fileURLToPath(new URL('./dist',import.meta.url))));
app.use((error,req,res,next)=>{console.error('Authentication unavailable:',error.name);res.status(503).json({message:'Please try again later'});});
app.listen(Number(process.env.PORT||4000),()=>console.log('Example website: '+origin));
