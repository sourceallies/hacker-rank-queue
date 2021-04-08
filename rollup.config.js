import typescript from '@rollup/plugin-typescript';
import { typescriptPaths } from 'rollup-plugin-typescript-paths';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'cjs',
  },
  external: ['@slack/bolt', 'dotenv', 'google-spreadsheet'],
  plugins: [typescript(), typescriptPaths()],
};
