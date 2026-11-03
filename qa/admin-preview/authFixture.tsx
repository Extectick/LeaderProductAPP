import {createContext} from 'react';
export const AuthContext = createContext({profile:{id:1,firstName:'Дизайн',lastName:'Администратор',role:{id:1,name:'admin'},permissions:['admin']},isLoading:false,isAuthenticated:true});
