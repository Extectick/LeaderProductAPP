import React from 'react';

/** No production auth module or stored credential is imported by this fixture. */
export const QA_USER_ID=9000101;
export const API_BASE_URL='http://127.0.0.1/help-real-service-fixture';
const auth={isAuthenticated:true,isLoading:false,profile:{id:QA_USER_ID,firstName:'QA',lastName:'Локальный',profileStatus:'ACTIVE',avatarUrl:null}};
export const AuthContext=React.createContext<any>(auth);
export const useAuth=()=>React.useContext(AuthContext);
const status={isReachable:true,lastReason:null};
export const useServerStatus=()=>status;
export const getServerStatus=()=>status;
// Unsigned, synthetic identity consumed only by the real HelpApi's local account fence.
const token='eyJhbGciOiJub25lIn0.eyJ1c2VySWQiOjkwMDAxMDF9.qa';
export const getAccessToken=async()=>token;
export const getAccessTokenForRequest=async()=>token;
export const refreshToken=async()=>token;
