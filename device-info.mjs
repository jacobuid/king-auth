/** Best-effort display labels. Capabilities and user agents do not prove hardware identity. */
export function deviceInfo(userAgent='',hints={}){
  const ua=String(userAgent),platform=hints.platform;
  const ipad=/iPad/i.test(ua)||(/Macintosh/i.test(ua)&&hints.multiTouch===true);
  const iphone=/iPhone|iPod/i.test(ua);
  const android=/Android/i.test(ua)||platform==='Android';
  const tablet=ipad||/Tablet|Kindle|Silk/i.test(ua)||(android&&!/Mobile/i.test(ua)&&hints.mobile!==true);
  const phone=iphone||/Mobi|Windows Phone/i.test(ua)||hints.mobile===true;
  const windows=/Windows/i.test(ua)||platform==='Windows';
  const mac=/Macintosh|Mac OS X/i.test(ua)||platform==='macOS';
  const chromeOS=/CrOS/i.test(ua)||platform==='Chrome OS';
  const linux=/Linux|X11/i.test(ua)||platform==='Linux';
  const device=tablet?'Tablet':phone?'Phone':windows||mac||chromeOS||linux?'Computer':'Unknown device';
  const osName=ipad?'iPadOS':iphone||platform==='iOS'?'iOS':android?'Android':/Windows Phone/i.test(ua)?'Windows Phone':windows?'Windows':chromeOS?'Chrome OS':mac?'macOS':linux?'Linux':null;
  const deviceName=ipad?'iPad':/iPhone/i.test(ua)?'iPhone':/iPod/i.test(ua)?'iPod':android?(tablet?'Android tablet':'Android phone'):/Windows Phone/i.test(ua)?'Windows phone':windows?'Windows computer':chromeOS?'Chromebook':mac?'Mac':linux?'Linux computer':device;
  const browserName=/Edg(?:e|A|iOS)?\//i.test(ua)?'Edge':/OPR\/|Opera|OPiOS\//i.test(ua)?'Opera':/SamsungBrowser\//i.test(ua)?'Samsung Internet':/Firefox\/|FxiOS\//i.test(ua)?'Firefox':/Chrome\/|Chromium\/|CriOS\//i.test(ua)?'Chrome':/Safari\//i.test(ua)?'Safari':null;
  return {device,deviceName,osName,browserName};
}
