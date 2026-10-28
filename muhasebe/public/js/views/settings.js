// Settings: company details, invoice prefixes, own password, users, backup and audit log.
import {
  html, raw, setHtml, get, put, post, field, formDialog, toast, toastError, isAdmin, session, ROLES, options,
  fmtDateTime, emptyRow, formData,
} from '../core.js';
import { changePasswordDialog } from '../app.js';

const ACTIONS = { create: 'ekledi', update: 'güncelledi', delete: 'sildi', cancel: 'iptal etti', login: 'giriş yaptı',
  setup: 'kurulumu yaptı', password: 'şifresini değiştirdi', backup: 'yedek aldı' };
const ENTITIES = { user: 'kullanıcı', product: 'ürün', party: 'cari', invoice: 'fatura', stock_move: 'stok hareketi',
  account: 'hesap', transaction: 'kasa/banka işlemi', settings: 'ayarlar', database: 'veritabanı' };

function userDialog(u = null) {
  return formDialog({
    title: u ? 'Kullanıcıyı düzenle' : 'Yeni kullanıcı',
    body: html`
      <div class="form-grid two">
        ${field('Kullanıcı adı', html`<input name="username" value="${u?.username || ''}" ${u ? raw('disabled') : raw('required')} maxlength="40" autocapitalize="off" spellcheck="false">`)}
        ${field('Ad soyad', html`<input name="name" value="${u?.name || ''}" required maxlength="80">`)}
        ${field('Yetki', html`<select name="role">${options(ROLES, u?.role || 'user')}</select>`,
          { hint: 'Yönetici: her şey. Kullanıcı: kayıt girer, silemez. Görüntüleme: sadece okur.' })}
        ${field(u ? 'Yeni şifre (değişmeyecekse boş)' : 'Şifre', html`<input type="password" name="password" ${u ? '' : raw('required')} autocomplete="new-password">`,
          { hint: 'En az 8 karakter.' })}
        ${u ? html`<label class="check span-2"><input type="checkbox" name="active" ${u.active ? raw('checked') : ''}> Hesap aktif</label>` : ''}
      </div>`,
    onSubmit: async (d) => {
      if (u) {
        if (!d.password) delete d.password;
        await put(`users/${u.id}`, d);
      } else {
        await post('users', d);
      }
      toast(u ? 'Kullanıcı güncellendi.' : 'Kullanıcı eklendi.');
      return true;
    },
  });
}

export async function settingsView(root, ctx) {
  const admin = isAdmin();
  const [settings, users, audit] = await Promise.all([
    get('settings'),
    admin ? get('users') : [],
    admin ? get('audit?limit=100') : [],
  ]);
  const ro = admin ? '' : raw('disabled');

  setHtml(root, html`
    <div class="page">
      <div class="page-head"><div><h1>Ayarlar</h1></div>
        <div class="actions"><button class="btn" data-act="password">Şifremi değiştir</button></div></div>

      <section class="card">
        <header><h2>Firma bilgileri</h2></header>
        <form data-form="company" class="form-grid">
          ${field('Firma unvanı', html`<input name="company_name" value="${settings.company_name || ''}" maxlength="300" ${ro}>`, { cls: 'span-2' })}
          ${field('Telefon', html`<input name="company_phone" value="${settings.company_phone || ''}" maxlength="300" ${ro}>`)}
          ${field('Adres', html`<textarea name="company_address" rows="2" maxlength="300" ${ro}>${settings.company_address || ''}</textarea>`, { cls: 'span-3' })}
          ${field('Vergi dairesi', html`<input name="company_tax_office" value="${settings.company_tax_office || ''}" maxlength="300" ${ro}>`)}
          ${field('Vergi no', html`<input name="company_tax_no" value="${settings.company_tax_no || ''}" maxlength="300" ${ro}>`)}
          <div></div>
          ${field('Satış faturası ön eki', html`<input name="sale_prefix" value="${settings.sale_prefix || ''}" maxlength="10" ${ro}>`)}
          ${field('Alış faturası ön eki', html`<input name="purchase_prefix" value="${settings.purchase_prefix || ''}" maxlength="10" ${ro}>`)}
          ${field('Satış iade ön eki', html`<input name="sale_return_prefix" value="${settings.sale_return_prefix || ''}" maxlength="10" ${ro}>`)}
          ${field('Alış iade ön eki', html`<input name="purchase_return_prefix" value="${settings.purchase_return_prefix || ''}" maxlength="10" ${ro}>`,
            { hint: 'Numara: ön ek + yıl + sıra (örn. SF2026000001).' })}
          ${admin ? html`<div class="span-3 form-actions"><button class="btn primary" type="submit">Kaydet</button></div>` : ''}
        </form>
      </section>

      ${admin ? html`
        <section class="card">
          <header><h2>Kullanıcılar</h2><button class="btn sm" data-act="new-user">+ Kullanıcı</button></header>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Ad soyad</th><th>Kullanıcı adı</th><th>Yetki</th><th>Durum</th><th></th></tr></thead>
            <tbody>${users.map((u) => html`<tr class="${u.active ? '' : 'inactive'}">
              <td>${u.name}${u.id === session.user.id ? html` <span class="badge">siz</span>` : ''}</td>
              <td class="mono">${u.username}</td><td>${ROLES[u.role]}</td><td>${u.active ? 'Aktif' : 'Kapalı'}</td>
              <td class="num"><button class="btn ghost sm" data-edit-user="${u.id}">Düzenle</button></td></tr>`)}</tbody>
          </table></div>
        </section>

        <section class="card">
          <header><h2>Yedekleme</h2></header>
          <p>Tüm verilerin tek dosyalık kopyasını indirin. Düzenli olarak (örneğin haftada bir) yedek alıp güvenli bir yerde saklayın.</p>
          <a class="btn" href="api/backup" download>Yedeği indir (.db)</a>
        </section>

        <section class="card">
          <header><h2>İşlem geçmişi</h2><small class="muted">son 100 işlem</small></header>
          <div class="table-wrap"><table class="table compact">
            <thead><tr><th>Zaman</th><th>Kullanıcı</th><th>İşlem</th><th>Ayrıntı</th></tr></thead>
            <tbody>${audit.length ? audit.map((a) => html`<tr>
              <td class="nowrap">${fmtDateTime(a.created_at)}</td><td>${a.user_name || '—'}</td>
              <td>${ENTITIES[a.entity] || a.entity} ${ACTIONS[a.action] || a.action}${a.entity_id ? ` #${a.entity_id}` : ''}</td>
              <td class="muted">${a.detail || ''}</td></tr>`) : emptyRow(4)}</tbody>
          </table></div>
        </section>` : html`<p class="muted">Kullanıcı yönetimi, yedekleme ve işlem geçmişi yalnızca yöneticilere açıktır.</p>`}
    </div>`);

  root.querySelector('[data-form=company]').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await put('settings', formData(e.target));
      session.company = e.target.elements.company_name.value;
      toast('Ayarlar kaydedildi.');
    } catch (err) {
      toastError(err);
    }
  });
  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const editId = e.target.closest('[data-edit-user]')?.dataset.editUser;
    try {
      if (act === 'password') await changePasswordDialog();
      if (act === 'new-user' && (await userDialog())) ctx.reload();
      if (editId && (await userDialog(users.find((u) => String(u.id) === editId)))) ctx.reload();
    } catch (err) {
      toastError(err);
    }
  });
}
