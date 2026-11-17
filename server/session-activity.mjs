/** Record verified use without refreshing credentials or extending their expiry. */
export async function recordSessionActivity(adapter,session,now=new Date()){
  if(!session||new Date(session.expiresAt)<=now)return false;
  if(session.lastActiveAt&&now-new Date(session.lastActiveAt)<60000)return false;
  try{
    const updated=await adapter.update({model:'session',where:[
      {field:'id',value:session.id},
      {field:'userId',value:session.userId},
      {field:'expiresAt',operator:'gt',value:now},
      // Do not let overlapping checks overwrite a more recent observation.
      {field:'lastActiveAt',value:session.lastActiveAt??null},
    ],update:{lastActiveAt:now}});
    return Boolean(updated);
  }catch{
    // Optional activity metadata must not turn a valid session check into an outage.
    return false;
  }
}
