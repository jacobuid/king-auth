import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SessionDetails} from '../packages/king-auth/session-view.mjs';

test('session rows display the app, device, browser version, IP, location and lifecycle dates',()=>{
  const item={appName:'King Sports',appOrigin:'https://jacobuid.github.io',appPath:'/king-sports/',device:'Phone',deviceName:'iPhone',osName:'iOS',browserName:'Safari',browserVersion:'26.6',appType:'PWA',ipAddress:'2603:8083:1440::1',location:{city:'Tyler',regionCode:'TX',country:'United States'},current:true,createdAt:'2026-11-01T10:00:00.000Z',expiresAt:'2026-12-01T10:00:00.000Z',lastActiveAt:'2026-11-16T10:00:00.000Z'};
  const markup=renderToStaticMarkup(React.createElement(SessionDetails,{item}));
  for(const text of ['King Sports','jacobuid.github.io/king-sports/','iPhone','This device','Safari 26.6','PWA','iOS','2603:8083:1440::1','Tyler, TX, United States','Last active:','Signed in:','Expires:','Sign out'])assert.ok(markup.includes(text),text);
  for(const date of [item.createdAt,item.expiresAt,item.lastActiveAt])assert.ok(markup.includes('dateTime="'+date+'"'));
});

test('legacy sessions show missing data honestly and escape untrusted display metadata',()=>{
  const markup=renderToStaticMarkup(React.createElement(SessionDetails,{item:{appName:'<script>alert(1)</script>',device:'Unknown device',createdAt:'2026-11-01',expiresAt:'2026-12-01'}}));
  assert.ok(markup.includes('&lt;script&gt;'));assert.ok(!markup.includes('<script>'));
  for(const text of ['Browser unavailable','Unavailable','Location unavailable','Last active: unavailable'])assert.ok(markup.includes(text));
  assert.ok(!markup.includes('This device'));assert.ok(!markup.includes('Invalid Date'));
});
