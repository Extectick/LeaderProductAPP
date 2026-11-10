import React from 'react';
export function useOrderShareActions(){const[feedback,setFeedback]=React.useState('');return {copying:false,feedback,copy:async()=>setFeedback('Локальный стенд: реальная ссылка не создаётся'),copyFromList:async()=>setFeedback('Локальный стенд: реальная ссылка не создаётся'),dismissFeedback:()=>setFeedback('')};}
