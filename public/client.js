const socket = io("ws://localhost:5555");
setInterval(()=>{ socket.emit('alive'); }, 10000);

function place_message(id, message) {
    const messages = document.querySelector('.right'), span = document.createElement('span'), room = message.room? `(${message.room})` : '';
    let messageObject = document.createElement('div'),final_message = '';
    if (!message.op) {
        span.innerHTML = message.message;
        final_message = span.innerText;
    } else final_message = message.message;
    messageObject.setAttribute('class', 'messageObject'); messageObject.id = id;
    messageObject.innerHTML = `<span class="id">[${id}] </span><span class="timestamp">[${message.timestamp}]</span><span class="channel"> ${room} </span><span class="author">${message.sender}: </span><span class="message">${final_message}</span>`;
    messageObject.onclick = function() {
        let idObject = messageObject.querySelector('span');
        idObject.style['display'] = idObject.style['display'] === ''? 'inline' : '';
    }
    messages.appendChild(messageObject);
    messages.scrollTop = messages.scrollHeight - messages.clientHeight;
}
function send_message() {
    const content = document.querySelector('#message_box');
    socket.emit('message', content.value);
    content.value = '';
}

document.querySelector('#message_box').onkeyup = function(event) { if (event.keyCode === 13) send_message(); }
document.querySelector('#post_button').onclick = function() { send_message() };

socket.on('banned', () => { location.replace('https://youtube.com'); });
socket.on('check_storage', () => { socket.emit('send_storage', localStorage); });
socket.on('clear', () => { document.querySelector('.right').innerHTML = ''; })
socket.on('message', messages => { for (let id in messages) place_message(id, messages[id]); });
socket.on('set_nick', () => {
    const nick = prompt('Nick');
    localStorage['_nick'] = nick;
    socket.emit('nick_sent', localStorage);
});
socket.on('userlist_update', args => {
    let user_box = document.querySelector('.left'), room_box = user_box.querySelector(`#${args.room}`);
    if (!room_box) {
        room_box = document.createElement('div');
        room_box.classList.add('room');
        room_box.id = args.room;
        user_box.append(room_box);
    }
    room_box.innerHTML = `<div class="title">${args.room}</div>`;
    for (let user of args.user_list) room_box.innerHTML += `<div class="user">${user}</div>`
});