require('dotenv').config()
const express = require('express'), app = express(), server = app.listen(5555, ()=>{}), { v4: uuid } = require('uuid'), http = require('https');
app.use(express.static(__dirname +'/public'));
const io = require('socket.io') (server, { cors: { origin: '*', methods: ['GET', 'POST'], credentials: true } }), server_name = '&Server', general_channel_name = 'General', clients = new Map(), rooms = {}, messages = {}, blacklist = [];
setInterval(() => { clients.forEach(function(value) { if (global_timestamp() > value.keep_alive + 20000) global_kickUser(value, 'AFK', true); }); }, 1000);

function command_commands(requester, message) {
    const args = message.split(' ');
    switch(args[0]) {
        case 'ban': command_kickBan(args, requester, true); break;
        case 'create': command_createRoom(args, requester); break;
        case 'delete': command_deleteMessage(args, requester); break;
        case 'help': command_printHelp(requester); break;
        case 'img': command_sendImage(args, requester); break;
        case 'kick': command_kickBan(args, requester, false); break;
        case 'mute': command_muteUser(args, requester, false); break;
        case 'purge': command_purge(args, requester); break;
        case 'switch': command_switchRoom(args, requester); break;
        case 'unmute': command_muteUser(args, requester, true); break;
        case 'yt': command_embedYoutubeVideo(args, requester); break;
        default: global_serverMessage([requester], 'Command not found');
    }
 }
 
function command_createRoom(args, requester) {
    if (verify_argumentLength(args, 2, requester)) return;
    if (verify_permissions(requester)) return;
    let password = args[2] == 'null'? null : args[2];
    global_createRoom(args[1], password);
    global_serverMessage([requester], `Room "${args[1]}" has been created`);
}

function command_deleteMessage(args, requester) {
    if (verify_argumentLength(args, 1, requester)) return;
    if (verify_permissions(requester)) return;
    for (let room in rooms) {
        if (messages[room].forEach((value, key) => {
            if (key === args[1]) {
                messages[room].delete(args[1]);
                global_loadMessages(room);
                return true;
            }
        })) break;
    }
    global_serverMessage([requester], 'Message not found or is a private message');
}

function command_embedYoutubeVideo(args, requester) {
    if (verify_argumentLength(args, 1, requester)) return;
    if (verify_generic(!args[1].match(/[-0-9A-Z_a-z]{11}/g), requester, 'This is not a valid Youtube video ID')) return;
    let client = global_getClient(null, requester);
    http.get(`https://i.ytimg.com/vi/${args[1]}/0.jpg`, res => {
        if (verify_generic(res.statusCode !== 200, requester, 'That video does not exist or is private')) return;
        global_serverMessage([client.channel], `<iframe frameborder="0" src="https://www.youtube.com/embed/${args[1]}"></iframe>`, true);
    });
}

function command_kickBan(args, requester, ban=false) {
    if (verify_argumentLength(args, 2, requester)) return;
    if (verify_permissions(requester)) return;
    let kickedUser = verify_userExist(args[1], requester);
    if (!kickedUser) return;
    if (ban) blacklist.push(kickedUser.socket.handshake.address);
    global_kickUser(kickedUser, args[2], true);
}

function command_muteUser(args, requester, unmute) {
    if (verify_argumentLength(args, unmute? 1 : 2, requester)) return;
    if (verify_permissions(requester)) return;
    let user = verify_userExist(args[1], requester);
    if (!user) return;
    if (verify_generic(!unmute && (isNaN(args[2]) || args[2] < 0), requester, 'A duration must be a positive integer')) return;
    if (unmute) {
        user.mute = 0;
        global_serverMessage(Array.from(user.rooms), `User "${args[1]}" has been unmuted`);
    } else {
        user.mute = global_timestamp() + (args[2] * 1000);
        global_serverMessage(Array.from(user.rooms), `User "${args[1]}" has been muted for ${args[2]} second(s)`);
    }
}

function command_printHelp(requester) {
    global_serverMessage([requester],
        '<br>!ban [nick] [reason] - Ban user<br>' + '!create [name] [password] - Create a new room<br>' +
        '!delete [message id] - Delete a message<br>' + '!help - Print this message<br>' +
        '!img [url] - Post an image<br>' + '!kick [nick] [reason] - Kick user<br>' + '!mute [nick] [seconds] - Mute user<br>' +
        '!purge [nick] - Purge all user messages<br>' + '!switch [room] [password] - Switch to the other room<br>' +
        '!unmute [nick] - Unmute user<br>' + '!yt [video id] - Embed a youtube video');
}

function command_purge(args, requester) {
    if (verify_argumentLength(args, 1, requester)) return;
    if (verify_permissions(requester)) return;
    let client = global_getClient(null, requester), room = client.channel, user = verify_userExist(args[1], requester),filtredMessages = new Map();
    if (!user) return;
    messages[room].forEach((value, key) => { if (value.sender !== user.nick) filtredMessages.set(key, value); });
    messages[room] = filtredMessages;
    global_loadMessages(room);
}

function command_sendImage(args, requester) {
    if (verify_argumentLength(args, 1, requester)) return;
    const client = global_getClient(null, requester);
    try {
        http.get(args[1], res => {
            if (verify_generic(res.statusCode !== 200, requester, 'Image not found')) return;
            global_serverMessage([client.channel], `<img src="${args[1]}">`);
        });
    } catch (_) { global_serverMessage(requester, 'Invalid URL'); }
}

function command_switchRoom(args, requester) {
    if (verify_argumentLength(args, 2, requester)) return;
    const client = global_getClient(null, requester), oldRoom = client.channel, room_to_switch = args[1], password = args[2] === 'null'? null : args[2];
    if (verify_generic(!rooms[room_to_switch], requester, 'Room not found')) return;
    if (verify_generic(room_to_switch === oldRoom, requester, 'You are already in this room')) return;
    if (verify_generic(!client.rooms.has(room_to_switch) && rooms[room_to_switch]['password'] !== password, requester, 'Incorrect password')) return;
    global_joinRoom(client, room_to_switch);
    if (oldRoom !== general_channel_name) {
        rooms[oldRoom]['user_list'].delete(client.nick);
        global_updateUserList(oldRoom);
    }
}

function global_checkNick(socket, localStorage, set) {
    let client = global_getClient(socket), nick = localStorage['_nick'], admin_name = 'Admin', id = client.socket.id;
    if (verify_generic(!nick, id, 'Nick can not be empty')) return;
    let op = localStorage['_op'] == process.env.PASSWORD, exist = global_getUser(nick);
    if (verify_generic(!nick.match(/^[0-9a-z]{5,20}$/ig) && !op, id, '<br>Nickname requirements:<br>' + '-> Length: 5-20 characters<br>' + '-> Alphanumeric characters only')) return;
    if (verify_generic(nick === server_name || (exist && !set), id, 'Impersonating attempt detected')) return;
    client.nick = nick; client.op = op;
    if (!rooms[general_channel_name]) global_createRoom(general_channel_name, null);
    global_joinRoom(client, general_channel_name);
    if (client.op) {
        if (!rooms[admin_name]) global_createRoom(admin_name, process.env.PASSWORD);
        global_joinRoom(client, admin_name);
    }
    global_serverMessage(Array.from(client.rooms), `${nick} has joined.`, true);
}

function global_createRoom(name, password) {
    rooms[name] = {password: password, user_list: new Set()};
    messages[name] = new Map();
}

function global_getClient(socket=null, id=null) {
    if (id) return clients.get(id);
    if (clients.has(socket.id)) return clients.get(socket.id);
    return null;
}

function global_getUser(nick=null) { for (let client of clients.values()) if (client.nick === nick) return client; }

function global_joinRoom(user, room) {
    user.channel = room;
    user.socket.join(room);
    rooms[room]['user_list'].add(user.nick);
    user.rooms = new Set(user.socket.rooms);
    global_updateUserList(room);
    global_loadMessages(room, user);
}

function global_kickUser(kickedUser, reason, hard_kick=false) {
    let userID = kickedUser.socket.id
    if (hard_kick) {
        global_serverMessage(Array.from(kickedUser.rooms), `${kickedUser.nick} disconnected (${reason})`, hard_kick);
        global_serverMessage(kickedUser, `You have been kicked for ${reason}`, false);
    } else global_serverMessage([userID], reason);
    for (let room in rooms) {
        if (rooms[room]['user_list'].has(kickedUser.nick)) rooms[room]['user_list'].delete(kickedUser.nick);
        global_updateUserList(room);
    }
    kickedUser.socket.disconnect();
    clients.delete(userID);
}

function global_loadMessages(room, target=null) {
    let final_target = target? target : room, object = {};
    io.to(final_target).emit('clear');
    messages[room].forEach((value, key) => { object[key] = value; });
    io.to(final_target).emit('message', object);
}

function global_serverMessage(rooms, message, global=false) {
    let visibleRooms = [];
    for (let room of rooms) if (!global_getClient(null, room)) visibleRooms.push(room);
    let obj = {message: message, room: visibleRooms, op: true, sender: server_name, timestamp: global_timestamp()}, id = uuid(), sentObj = {};
    if (global) for (let room of rooms) if (!clients.has(room)) messages[room].set(id, obj);
    sentObj[id] = obj;
    if (!global) obj.room = "YOU" 
    io.to(rooms).emit('message', sentObj);
}

function global_timestamp() { return new Date().getTime(); }

function global_updateUserList(room=general_channel_name) {
    const user_list = [];
    for (let user of rooms[room]['user_list']) {
        let op = global_getUser(user).op
        user_list.push(`${op? '@' : ''}${user}`);
    }
    io.to(room).emit('userlist_update', {room: room, user_list: user_list.sort()});
}

function verify_argumentLength(args, length, requester) {
    return verify_generic(args.length < (length + 1), requester, `${length} argument(s) needed, found ${args.length - 1}`);
}

function verify_generic(condition, user, message) {
    if (condition) {
        global_serverMessage([user], message);
        return true;
    } else return false;
}

function verify_permissions(requester) {
    let client = global_getClient(null, requester);
    return verify_generic(!client.op, requester, 'Insufficient permissions');
}

function verify_userExist(nick, requester) {
    let user = global_getUser(nick);
    return verify_generic(!user, requester, 'User not found')? null : user;
}

io.on('connection', s=> {
    if (blacklist.includes(s.handshake.address)) {
        s.emit('banned');
        s.disconnect();
        return;
    }
    s.emit('check_storage');
    clients.set(s.id, {rooms: {}, socket: s, keep_alive: new Date().getTime()});

    s.on('alive', () => {
        const client = global_getClient(s);
        if (client) client.keep_alive = global_timestamp();
    });

    s.on('message', message => {
        const client = global_getClient(s);
        if (!client) return;
        if (verify_generic(client.mute > global_timestamp(), s.id, 'You are muted')) return;
        if (verify_generic(!message.match(/^.{1,200}$/g) && !client.op, s.id, `Message can not be empty or be longer than 200 characters.`)) return;
        if (message.charAt(0) === '!') command_commands(s.id, message.substring(1));
        else {
            let id = uuid(), object = {message: message, op: client.op, room: client.channel, sender: client.nick, timestamp: global_timestamp()}, sentObj = {};
            messages[client.channel].set(id, object);
            sentObj[id] = object;
            io.to(client.channel).emit('message', sentObj);
        }
    });

    s.on('send_storage', localStorage => {
        if (!localStorage['_nick']) s.emit('set_nick');
        else global_checkNick(s, localStorage, true);
    });

    s.on('nick_sent', localStorage => {
        global_checkNick(s, localStorage, false);
    });
});