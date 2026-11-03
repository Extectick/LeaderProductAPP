import React,{useState} from 'react';
import AdminDirectory from '../../src/features/admin/redesign/AdminDirectory';
import {FixtureAdminProvider} from './FixtureAdminProvider';
import {DesignSheet,DesignHint} from '../../src/features/admin/redesign/AdminDesignPrimitives';
export default function PreviewDirectory(){const [profile,setProfile]=useState(false);return <FixtureAdminProvider><AdminDirectory onExit={()=>{}} onProfile={()=>setProfile(true)}/>{profile&&<DesignSheet title="Профиль" onClose={()=>setProfile(false)}><DesignHint>Администратор · Полный доступ к разделам</DesignHint></DesignSheet>}</FixtureAdminProvider>;}
