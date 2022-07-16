import express from 'express';
import 'dotenv/config';

import cors from 'cors';
import { Request, Response, Router } from 'express';

import fileUpload, { UploadedFile } from 'express-fileupload';
import admZip from 'adm-zip';

import { promises as fs } from 'fs';
import fse from 'fs-extra';
import { TheMerger } from './merger';

const app = express();

const route = Router();

app.use(express.json());
app.use(fileUpload());
app.use(cors());

const saveFile = async (file: UploadedFile, isMain: boolean) => {
  const prefix = isMain ? 'main' : 'secondary';
  const uploadPath = __dirname + '/temp/' + prefix + '.zip';
  await file.mv(uploadPath);

  const zip = new admZip(uploadPath);
  zip.extractAllTo(`${__dirname}/db/${prefix}`, true);
};

const checkFiles = (files: UploadedFile[]) => {
  if (files.some((file) => file === undefined))
    return {
      status: false,
      message: 'Two valid files are required',
    };
  else if (files.some((file) => !file.name.endsWith('.jwlibrary')))
    return {
      status: false,
      message: 'Only .jwlibrary files are allowed',
    };

  return {
    status: true,
  };
};

const renameFiles = async () => {
  for (const prefix of ['main', 'secondary']) {
    const files = await fs.readdir(`${__dirname}/db/${prefix}`);

    for (const file of files) {
      if (file.endsWith('.db')) {
        await fs.rename(
          `${__dirname}/db/${prefix}/${file}`,
          `${__dirname}/db/${prefix}/${prefix}.db`
        );
      }
    }
  }
};

const prepareAndZipFiles = async () => {
  const manifest = await fs.readFile(
    `${__dirname}/db/main/manifest.json`,
    'utf8'
  );

  const dbName = JSON.parse(manifest).userDataBackup.databaseName;
  await fs.rename(
    `${__dirname}/db/main/main.db`,
    `${__dirname}/db/main/${dbName}`
  );

  const zip = new admZip();
  zip.addLocalFile(`${__dirname}/db/main/${dbName}`);
  zip.addLocalFile(`${__dirname}/db/main/manifest.json`);
  zip.writeZip(`${__dirname}/db/merged.jwlibrary`);
};

const clean = async () => {
  await fse.emptyDir(`${__dirname}/db/`);
  await fse.emptyDir(`${__dirname}/temp/`);
};

fse.ensureDir(`${__dirname}/temp`);
fse.ensureDir(`${__dirname}/db`);

route.post('/merge-db', async (req: Request, res: Response) => {
  try {
    const file1 = req.files?.main as UploadedFile;
    const file2 = req.files?.toMerge as UploadedFile;

    const filesChecker = checkFiles([file1, file2]);

    if (filesChecker.status) {
      await clean();
      await saveFile(file1, file1.size > file2.size);
      await saveFile(file2, file2.size > file1.size);

      await renameFiles();
      TheMerger();

      await prepareAndZipFiles();
      res.download(`${__dirname}/db/merged.jwlibrary`);
    } else {
      res.status(400).send({
        message: filesChecker.message,
      });
    }
  } catch (e) {
    console.log(e);
    res.status(500).send('Unexpected error');
  }
});

app.use(route);

app.listen(process.env.API_PORT, () => {
  console.log(`Server started at port ${process.env.API_PORT}`);
});
