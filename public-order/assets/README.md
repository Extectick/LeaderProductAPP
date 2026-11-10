# Public order weight icon

`weight-kilogram.woff` contains only `weight-kilogram` (U+F05A2) from the installed
MaterialCommunityIcons font in `@expo/vector-icons`. This is the original library
outline, not a redrawn icon. It is rendered with the existing Material UI `Icon`.

The font is a mechanical WOFF subset, so public orders do not load the entire
MaterialCommunityIcons font or React Native/Expo runtime. The normal web build
copies the checked-in subset; Python is not needed in CI or production.

To regenerate from the installed dependency (FontTools required):

```text
python -m fontTools.subset node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf --unicodes=U+F05A2 --flavor=woff --output-file=public-order/assets/weight-kilogram.woff
```

Source: https://github.com/Templarian/MaterialDesign-Webfont
License: Apache-2.0, see `LICENSE-APACHE-2.0.txt` and
https://pictogrammers.com/docs/general/license/ . The subset removes other glyphs
and converts the font container; it does not alter the selected icon's outline.
