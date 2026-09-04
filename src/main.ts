import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Antd from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';
import './style.css';
import App from './App.vue';
import { markEmbeddedDocument } from './utils/embedContext';

markEmbeddedDocument();

const app = createApp(App);

app.use(createPinia());
app.use(Antd);

app.mount('#app');
