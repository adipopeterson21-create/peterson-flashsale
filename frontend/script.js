
async function loadProducts(){
  try{
    const res = await fetch('/api/products');
    const products = await res.json();
    const grid = document.getElementById('productsGrid');
    grid.innerHTML='';
    products.forEach(p=>{
      const card = document.createElement('div'); card.className='card';
      const media = document.createElement('div'); media.className='card-media';
      const img = document.createElement('img'); img.src = p.image || '/admin/placeholder.png'; img.alt=p.title;
      img.style.width='100%'; img.style.height='100%'; img.style.objectFit='cover';
      media.appendChild(img);
      const title = document.createElement('div'); title.className='card-title'; title.innerText = p.title;
      const desc = document.createElement('div'); desc.className='card-desc'; desc.innerText = p.description || '';
      const footer = document.createElement('div'); footer.className='card-footer';
      const price = document.createElement('div'); price.innerText = '$' + ((p.price_cents||0)/100).toFixed(2);
      const btn = document.createElement('button'); btn.className='btn btn-primary'; btn.innerText='Order'; btn.setAttribute('data-id', p.id);
      footer.appendChild(price); footer.appendChild(btn);
      card.appendChild(media); card.appendChild(title); card.appendChild(desc); card.appendChild(footer);
      grid.appendChild(card);
    });
  }catch(e){ console.error(e); }
}

document.addEventListener('click', function(e){
  const btn = e.target.closest('button[data-id]');
  if(btn && btn.innerText.toLowerCase().includes('order')){
    const id = btn.getAttribute('data-id');
    checkoutItems([{ id, quantity: 1 }]);
  }
});

async function checkoutItems(items){
  try{
    const res = await fetch('/api/orders/checkout', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ items }) });
    const data = await res.json();
    if(data.url) window.location = data.url;
    else alert('Checkout failed');
  }catch(e){ console.error(e); alert('Checkout error'); }
}

document.getElementById && document.addEventListener('DOMContentLoaded', function(){
  loadProducts();
  const donForm = document.getElementById('donationForm');
  if(donForm) donForm.addEventListener('submit', async function(ev){ ev.preventDefault(); const amount = Number(document.getElementById('donAmount').value||0); const name = document.getElementById('donName').value||'Supporter'; if(amount<=0) return alert('Enter amount'); const res = await fetch('/api/donations/checkout', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ amount, name }) }); const data = await res.json(); if(data.url) window.location=data.url; else alert('Donation error'); });
});
