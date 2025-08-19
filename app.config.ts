// app.config.ts
import { ExpoConfig } from 'expo/config';

export default (): ExpoConfig => ({
  name: 'Лидер Продукт',
  slug: 'leader-product',
  splash: {
    image: './assets/images/splash.png',
    // backgroundColor: '#ffffff', // цвет фона под картинкой
    // resizeMode: 'contain',      // или 'cover'
  },
});
