const express = require('express');
const { readdir, cp, rm, rename } = require('fs/promises');
const { join, sep } = require('path');
const cors = require('cors');
const fs = require('fs')

let app = express()

app.use(express.json())
app.use(cors());

const getFileType = (file) => {
    if (file.isBlockDevice()) {
        return 'disk';
    }

    if (file.isDirectory()) {
        return 'dir';
    }

    if (file.isFile()) {
        return 'file';
    }

    if (file.isSymbolicLink()) {
        return 'link';
    }

    return 'file';
}

const getLastModifiedFate = (file) => {
    try {
        return fs.statSync(file).mtime.toLocaleDateString()
    } catch (e) {
        try {
            return fs.statSync(file).birthtime.toLocaleDateString()
        } catch(e){
            return '-'
        }
    }
}

const getFileSize = (file) => {
    const byteUnits= ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    let i = -1;
    try{
        let fileSize = fs.statSync(file).size
        do {
            fileSize = fileSize / 1024
            i++;
        } while (fileSize > 1024)
        return Math.max(fileSize, 0.1).toFixed(1) + byteUnits[i]
    } catch(e) {
        return '-'
    }
}

const readDir = (path, res) => {
    readdir(path, { withFileTypes: true }).then((files) => {
        res.send(
            files.map((file) => ({
                name: file.name,
                type: getFileType(file),
                ext: file.name.split('.').pop(),
                mtime: getLastModifiedFate(`${path}${file.name}`),
                size: getFileSize(`${path}${file.name}`)
            }))
        );
    })
}

app.post('/ls', function(req,res) {
    const requiredPath = req.body.path || ['C:'] || ['D:'];
    const path = join(...requiredPath, sep);
    readDir(path,res)
})

app.post('/dl', async (req,res) => {
    const filesToDelete = req.body.files.map((file) => ({ 
            path: join(...file.path), 
            isDir: file.isDir 
        }));
    await Promise.all(filesToDelete.map((file) => rm(file.path, {recursive: file.isDir})))
    res.send({success: true});
})

app.post('/cp', async (req,res) => {
    const filesToCopy = req.body.files.map((file) => ({
        path: join(...file.path),
        isDir: file.isDir,
        name: file.name
    }))
    await Promise.all(filesToCopy.map((file) => {  
        const pathToCopy = join(...req.body.path, sep, file.name)
        cp(file.path, pathToCopy, {recursive: file.isDir})
    }
    ))
    res.send({success: true})
})

app.post('/mv', async(req,res) => {
    const filesToMove = req.body.files.map((file) => ({
        path: join(...file.path),
        isDir: file.isDir,
        name: file.name
    }))
    const needToCopyStates = ['EXDEV', 'ERROR_NOT_SAME_DEVICE'];

    const tryToMove = async (oldPath, newPath, isDir) => {
        try {
            await rename(oldPath, newPath, {recursive: isDir})
        } catch (e) {
            if (needToCopyStates.includes(e.code)) {
                await cp(oldPath, newPath, {recursive: isDir});
                await rm(oldPath, {recursive: isDir})
                return true;
            }
            throw new Error('Cant move file');
        }
    }
    await Promise.all(filesToMove.map((file) => {
        const pathToMove = join(...req.body.path, sep,file.name);
        return tryToMove(file.path, pathToMove, file.isDir);
    }))
    res.send({success:true})
})

app.listen(3123)